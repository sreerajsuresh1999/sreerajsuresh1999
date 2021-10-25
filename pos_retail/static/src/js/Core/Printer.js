odoo.define('pos_retail.Printer', function (require) {
    const Printer = require('point_of_sale.Printer');
    const core = require('web.core');
    const _t = core._t;
    const {Gui} = require('point_of_sale.Gui');
    const session = require('web.session');

    Printer.Printer.include({
        _onIoTActionResult: function (data) {
            try {
                this._super(data)
            } catch (e) {
                return Gui.showPopup('ErrorPopup', {
                    title: _t('Error'),
                    body: _t('Your POS Disconnected Kitchen Printer, please Your POS Setting or Your Internet Connection')
                })
            }
        },
        printHtmlToImage: async function (receipt) {
            let printNumber = 1
            if (this.pos.config.duplicate_receipt && this.pos.config.duplicate_number > 1) {
                printNumber = this.pos.config.duplicate_number
            }
            for (let i = 0; i < printNumber; i++) {
                if (receipt) {
                    this.receipt_queue.push(receipt);
                }
                let image, sendPrintResult;
                while (this.receipt_queue.length > 0) {
                    receipt = this.receipt_queue.shift();
                    image = await this.htmlToImg(receipt);
                    try {
                        sendPrintResult = await this.send_printing_job(image);
                    } catch (error) {
                        // Error in communicating to the IoT box.
                        this.receipt_queue.length = 0;
                        return this.printResultGenerator.IoTActionError();
                    }
                    // rpc call is okay but printing failed because
                    // IoT box can't find a printer.
                    if (!sendPrintResult || sendPrintResult.result === false) {
                        this.receipt_queue.length = 0;
                        return this.printResultGenerator.IoTResultError();
                    }
                }
            }
            return this.printResultGenerator.Successful();

        },
        // TODO: Odoo-Server now like IOT-BOX controller for connecting to printer (required the same lan network)
        async printViaOdooServerNetwork(receipt, numberPrint = 1) {
            const params = {
                'receipt': receipt
            }
            params.ip = this.pos.config.local_network_printer_ip_address
            params.port = this.pos.config.local_network_printer_port
            for (let i = 0; i < numberPrint; i++) {
                session.rpc('/printer_network/print_xml_receipt', params || {}, {shadow: true}).then(function (results) {
                    if (results.error) {
                        return window.posmodel.alert_message({
                            title: _t('Network Printer Error'),
                            body: JSON.stringify(results.message, null, '..........')
                        })
                    } else {
                        return window.posmodel.alert_message({
                            title: _t('Successfully'),
                            body: _t('Print Successfully, please look at to your printer and get Receipt !!'),
                        })
                    }
                });
            }
            return this.printResultGenerator.Successful();
        },
        // TODO: have 3 solutions for print receipt
        // 1) Use Odoo like IOTBOX and send receipt to printer network
        // 2) Use IOT-BOX send receipt to printer network
        // 3) Normally printing, print receipt direct printer USB
        async printXmlReceipt(receipt, numberPrint = 1) {
            if (!receipt) {
                return false
            }
            if (this.pos.config.local_network_printer && this.pos.config.local_network_printer_ip_address && this.pos.config.local_network_printer_port) {
                console.log('[Printing] Local network via Odoo-Server !')
                for (let i = 0; i < numberPrint; i++) {
                    await this.printViaOdooServerNetwork(receipt)
                }
                if (!this.pos.epson_printer_default) {
                    return this.printResultGenerator.Successful();
                }
            }
            if (this.pos.epson_printer_default) {
                console.log('[Printing] Local network via IOT-BOX !')
                for (let i = 0; i < numberPrint; i++) {
                    await this.pos.print_network(receipt, this.pos.epson_printer_default['ip'])
                }
                return this.printResultGenerator.Successful();
            }
            console.log('[Printing] Direct printer via IOT-BOX !')
            for (let i = 0; i < numberPrint; i++) {
                this.connection.rpc('/hw_proxy/print_xml_receipt', {
                    receipt: receipt,
                });
            }
            return this.printResultGenerator.Successful();
        },
        send_printing_job: function (img) { // TODO: fixed loading times send img to printer, and running background
            if (this.connection && this.connection.server == "http://localhost:8069") {
                return true
            } else {
                return this._super(img);
            }
        },
    });

})
