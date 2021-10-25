odoo.define('point_of_sale.NetworkPrinterStatus', function (require) {
    'use strict';

    const {useState} = owl;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    var Session = require('web.Session');

    class NetworkPrinterStatus extends PosComponent {
        constructor() {
            super(...arguments);
            let synch = this.env.pos.get('printer.status');
            if (!synch) {
                synch = {
                    state: 'disconnected',
                    pending: ''
                }
            }
            this.state = useState({status: synch.state, msg: synch.pending});
            this.env.pos.on(
                'change:printer.status',
                (pos, synch) => {
                    this.state.status = synch.state;
                    this.state.msg = synch.pending;
                },
                this
            );
        }

        willUnmount() {
            this.env.pos.on('change:printer.status', null, this);
        }

        async onClick() {
            var printer_ips = [];
            for (var i = 0; i < this.env.pos.epson_printers.length; i++) {
                printer_ips.push(this.env.pos.epson_printers[i]['ip'])
            }
            if (printer_ips.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Printers Network Offline'),
                    body: this.env._t('Have not any Printers Network add to your POS Config')
                })
            }
            if (!this.env.pos.proxy) {
                return this.env.pos.alert_message({
                    title: this.env._t('Printers Network Offline'),
                    body: this.env._t('Your POS missed setup IOT/POXBOX. Please setup first')
                })
            }
            var params = {
                printer_ips: printer_ips,
            };
            let connection = new Session(void 0, this.env.pos.proxy.host, {
                use_cors: true
            });
            let results = await connection.rpc("/hw_proxy/get_printers_status", params, {
                shadow: true,
                timeout: 7500
            })
            if (results) {
                let values = JSON.parse(results)['values'];
                let lists = []
                for (let ipAddress in values) {
                    lists.push({
                        id: ipAddress,
                        label: ipAddress + ':' + values[ipAddress],
                        item: values
                    })
                    var receipt = '<div>POS Retail Copyright © 2014 TL Technology. All right reserved. If you need quickly support please email to: thanhchatvn@gmail.com or discuss viva our skype thanhchatvn</div>';
                    await this.env.pos.print_network(receipt, ipAddress);
                    this.env.pos.set('printer.status', {'state': 'connected', 'pending': ipAddress});
                }
                this.showPopup('SelectionPopup', {
                    title: this.env._t('Status of all Printers Network'),
                    list: lists
                })
            }

        }
    }

    NetworkPrinterStatus.template = 'NetworkPrinterStatus';

    Registries.Component.add(NetworkPrinterStatus);

    return NetworkPrinterStatus;
});
