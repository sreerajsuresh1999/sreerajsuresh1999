odoo.define('point_of_sale.LocalPrinterNetwork', function (require) {
    'use strict';

    const {useState} = owl;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const session = require('web.session');

    class LocalPrinterNetwork extends PosComponent {
        constructor() {
            super(...arguments);
            let synch = this.env.pos.get('local.network.printer.status');
            if (!synch) {
                synch = {
                    state: 'disconnected',
                    pending: ''
                }
            }
            this.state = useState({status: synch.state, msg: synch.pending});
        }

        mounted() {
            super.mounted()
            this.env.pos.on(
                'change:local.network.printer.status',
                (pos, synch) => {
                    this.state.status = synch.state;
                    this.state.msg = synch.pending;
                },
                this
            );
            this.checkStatusOfPrinterDailyTime()
        }

        willUnmount() {
            super.willUnmount()
            this.env.pos.on('change:local.network.printer.status', null, this);
        }

        autoCheckingStatusOfNetworkPrinter() {
            const self = this;
            this.checkStatusOfPrinterDailyTime()
            setTimeout(() => {
                self.autoCheckingStatusOfNetworkPrinter()
            }, 15000)

        }

        async checkStatusOfPrinterDailyTime() {
            this.state.status = 'connecting'
            const params = {
                'printer_ip': this.env.pos.config.local_network_printer_ip_address
            }
            let status = await session.rpc('/printer_network/get_status', params || {}, {shadow: true})
            if (!status) {
                this.state.status = 'error'
                this.state.msg = this.env.pos.config.local_network_printer_ip_address + this.env._t(' Offline')
            } else {
                this.state.status = 'connected'
                this.state.msg = this.env._t('EPSON Printer')
            }
            return status
        }

        async onClick() {
            let statusPrinter = await this.checkStatusOfPrinterDailyTime()
            if (statusPrinter) {
                const receipt = '<div>POS Retail Copyright © 2014 TL Technology. All right reserved. If you need quickly support please email to: thanhchatvn@gmail.com or discuss viva our skype thanhchatvn</div>';
                const params = {
                    'receipt': receipt
                }
                params.ip = this.env.pos.config.local_network_printer_ip_address
                params.port = this.env.pos.config.local_network_printer_port
                let results = session.rpc('/printer_network/print_xml_receipt', params || {}, {shadow: true})
                if (results.error) {
                    return window.posmodel.alert_message({
                        title:  this.env._t('Network Printer Error'),
                        body: JSON.stringify(results.message, null, '..........')
                    })
                } else {
                    return window.posmodel.alert_message({
                        title: this.env._t('Successfully'),
                        body:  this.env._t('Print Successfully, please look at to your printer and get Receipt !!'),
                    })
                }
            }
        }
    }

    LocalPrinterNetwork.template = 'LocalPrinterNetwork';

    Registries.Component.add(LocalPrinterNetwork);

    return LocalPrinterNetwork;
});
