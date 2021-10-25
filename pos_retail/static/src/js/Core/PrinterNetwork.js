"use strict";
odoo.define('pos_retail.PrinterNetwork', function (require) {

    const models = require('point_of_sale.models');
    const core = require('web.core');
    const qweb = core.qweb;
    const Printer = require('point_of_sale.Printer');
    const PrinterRetail = require('pos_retail.Printer');
    const devices = require('point_of_sale.devices');
    const BigData = require('pos_retail.big_data');

    devices.ProxyDevice.include({
        keepalive: function () {
            this._super();
        },
    });

    let _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            const self = this;
            let base_restaurant_printer_model = this.get_model('restaurant.printer');
            base_restaurant_printer_model.fields.push('printer_id', 'printer_type', 'product_categories_ids'); // v13 called: product_categories_ids
            base_restaurant_printer_model.domain = function (self) {
                if (self.config.pos_branch_id) {
                    return [['id', 'in', self.config.printer_ids], '|', ['branch_id', '=', self.config.pos_branch_id[0]], ['branch_id', '=', null]];
                } else {
                    return [['id', 'in', self.config.printer_ids]];
                }
            };
            let _super_restaurant_printer_model_loaded = base_restaurant_printer_model.loaded;
            base_restaurant_printer_model.loaded = function (self, printers) {
                for (let i = 0; i < printers.length; i++) {
                    let printer = printers[i];
                    if (printer['printer_id'] && printer['printer_type'] == 'network') {
                        let epson_printer = self.epson_priner_by_id[printer['printer_id'][0]];
                        if (epson_printer) {
                            let categoriers = [];
                            for (let index in printer.product_categories_ids) {
                                let category_id = printer.product_categories_ids[index];
                                let category = self.pos_category_by_id[category_id];
                                if (category) {
                                    categoriers.push(category);
                                }
                            }
                            epson_printer['categoriers'] = categoriers;
                            self.epson_priner_by_id[epson_printer['id']] = epson_printer;
                            self.epson_priner_by_ip[epson_printer['ip']] = epson_printer;
                            let epson_exsited_before = _.find(self.epson_printers, function (printer) {
                                return printer['id'] == epson_printer['id']
                            });
                            if (!epson_exsited_before) {
                                self.epson_printers.push(epson_printer)
                            }
                        }
                    }
                }
                _super_restaurant_printer_model_loaded(self, printers);
            };
            _super_PosModel.initialize.apply(this, arguments);

        },

        load_server_data: function () {
            let self = this;
            console.log('load_server_data 1')
            return _super_PosModel.load_server_data.apply(this, arguments).then(function () {
                self._autoCheckStatusOfPrinterNetwork()
            });
        },
        _autoCheckStatusOfPrinterNetwork() {
            // TODO: delay 5 seconds, auto call this function for check status of all printers
            const self = this;

            function auto_update_status_printer() {
                let printer_ips = [];
                for (let i = 0; i < self.epson_printers.length; i++) {
                    printer_ips.push(self.epson_printers[i]['ip'])
                }
                let params = {
                    printer_ips: printer_ips,
                };
                self.set('printer.status', {'state': 'connecting', 'pending': 'Connecting Printers'});
                if (self.proxy.connection) {
                    return self.proxy.connection.rpc("/hw_proxy/get_printers_status", params, {
                        shadow: true,
                        timeout: 2500
                    }).then(function (results) {
                        let values = JSON.parse(results)['values'];
                        let online = true;
                        let pending = 0;
                        for (let printer_ip in values) {
                            if (values[printer_ip] == 'Offline') {
                                online = false;
                                pending += 1
                            }
                            let epson_printer = _.find(self.epson_printers, function (printer) {
                                return printer['ip'] == printer_ip;
                            });
                            if (epson_printer) {
                                epson_printer['state'] = values[printer_ip]
                            }
                            if (online == true) {
                                self.set('printer.status', {'state': 'connected', 'pending': printer_ip});
                            } else {
                                self.set('printer.status', {
                                    'state': 'disconnected',
                                    'pending': printer_ip + ' Off'
                                });
                            }
                        }
                        setTimeout(auto_update_status_printer, 5000);
                    }, function (error) {
                        setTimeout(auto_update_status_printer, 5000);
                        self.set('printer.status', {
                            'state': 'disconnected',
                            'pending': 'Printer or your Internet Off'
                        });
                    });
                } else {
                    setTimeout(auto_update_status_printer, 5000);
                    self.set('printer.status', {
                        'state': 'error',
                        'pending': 'IOTBoxes Offline'
                    });
                }
            }

            if (this.epson_printers.length) {
                auto_update_status_printer();
            }
        },
        async print_network(receipt, proxy) {
            console.log('[print_network] to :' + proxy);
            let status = true
            const self = this;
            const printer = this.epson_printers.find(p => p['ip'] == proxy)
            if (printer) {
                const params = {
                    receipt: receipt,
                    proxy: proxy,
                };
                if (!this.proxy || !this.proxy.host) {
                    return this.chrome.showPopup('ErrorPopup', {
                        title: 'Error',
                        body: 'Your pos config not setting POS/IOT box IP address'
                    })
                }
                self.set('printer.status', {'state': 'connecting', 'pending': 'Printing'});
                let printResult = await this.proxy.connection.rpc("/hw_proxy/print_network", params, {
                    shadow: true,
                    timeout: 7500
                }).then(function (values) {
                    self.set('printer.status', {'state': 'connected', 'pending': proxy});
                    return values
                }, function (err) {
                    self.set('printer.status', {'state': 'error', 'pending': proxy});
                    if (err['message'] && err['message']['code'] == -32098) {
                        console.error('Printer IP address: ' + proxy + ' Offline or Your internet not connect to POS/IOT Box. Please checking')
                    }
                    return false
                })
                console.log('[print_network] Result')
                console.log(printResult)
                if (printResult == false) {
                    status = false
                }
            } else {
                status = false
            }
            return status;
        },
    });

    let _super_Order = models.Order.prototype;
    models.Order = models.Order.extend({
        printChanges: function () {
            let printers = this.pos.printers;
            let printerNetwork = printers.find((p) => p.printer_type == 'network')
            let printerViaPOSBOX = this.pos.config.proxy_ip && this.pos.config.iface_print_via_proxy
            if (!printerNetwork && !printerViaPOSBOX) { // todo: if pos not set proxy ip or printer network we return back odoo original
                return _super_Order.printChanges.apply(this, arguments);
            } else {
                let isPrintSuccessful = true;
                let epson_printer = null;
                for (let i = 0; i < printers.length; i++) {
                    let printer = printers[i];
                    let changes = this.computeChanges(printer.config.product_categories_ids);
                    if (changes['new'].length > 0 || changes['cancelled'].length > 0) {
                        let receipt = qweb.render('OrderChangeReceipt', {changes: changes, widget: this});
                        if (!printer.config.printer_id) {
                            printers[i].print(receipt);
                        } else {
                            let epson_printer_will_connect = this.pos.epson_priner_by_id[printer.config.printer_id[0]];
                            epson_printer = _.find(this.pos.epson_printers, function (epson_printer) {
                                return epson_printer['ip'] == epson_printer_will_connect['ip'] && epson_printer['state'] == 'Online'
                            });
                            if (epson_printer) {
                                this.pos.print_network(receipt, epson_printer['ip'])
                            }
                        }
                    }
                }
                if (!epson_printer) {
                    return _super_Order.printChanges.apply(this, arguments);
                }
                return isPrintSuccessful
            }
        },
    })
});