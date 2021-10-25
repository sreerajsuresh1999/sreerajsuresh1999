odoo.define('pos_retail.ListFeaturesButtons', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const qweb = core.qweb;
    const {posbus} = require('point_of_sale.utils');
    const {Printer} = require('point_of_sale.Printer');
    const OrderReceipt = require('point_of_sale.OrderReceipt');
    const field_utils = require('web.field_utils');

    class ListFeaturesButtons extends PosComponent {
        constructor() {
            super(...arguments);
            this._currentOrder = this.env.pos.get_order();
            if (this._currentOrder) {
                this._currentOrder.orderlines.on('change', this.render, this);
            }
            this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
        }

        willUnmount() {
            if (this._currentOrder) {
                this._currentOrder.orderlines.off('change', null, this);
            }
            this.env.pos.off('change:selectedOrder', null, this);
        }

        _updateCurrentOrder(pos, newSelectedOrder) {
            this._currentOrder.orderlines.off('change', null, this);
            if (newSelectedOrder) {
                this._currentOrder = newSelectedOrder;
                this._currentOrder.orderlines.on('change', this.render, this);
            }
        }

        get client() {
            return this.env.pos.get_client();
        }

        get getClientName() {
            if (this.env.pos.get_order()) {
                const selectedOrder = this.env.pos.get_order()
                if (selectedOrder.get_client()) {
                    return selectedOrder.get_client().display_name
                } else {
                    return this.env._t('Customer')
                }
            } else {
                return this.env._t('Customer')
            }
        }

        async saveToDraftOrder() {
            const selectedOrder = this.env.pos.get_order();
            if (selectedOrder.orderlines.length == 0) {
                return this.env.pos.chrome.showNotification(this.env._t('Error'), this.env._t('Your Order Cart is Blank'))
            }
            let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                title: this.env._t('Alert'),
                body: this.env._t("Are you want save current Order to Draft Order ?"),
            })
            if (confirmed) {
                if (!this.env.pos.config.allow_order_out_of_stock) {
                    const quantitiesByProduct = selectedOrder.product_quantity_by_product_id()
                    let isValidStockAllLines = true;
                    for (let n = 0; n < selectedOrder.orderlines.models.length; n++) {
                        let l = selectedOrder.orderlines.models[n];
                        let currentStockInCart = quantitiesByProduct[l.product.id]
                        if (l.product.type == 'product' && l.product.qty_available < currentStockInCart) {
                            isValidStockAllLines = false
                            this.env.pos.alert_message({
                                title: this.env._t('Error'),
                                body: l.product.display_name + this.env._t(' not enough for sale. Current stock on hand only have: ') + l.product.qty_available + this.env._t(' . Your cart add ') + currentStockInCart + this.env._t(' (items). Bigger than stock on hand have of Product !!!'),
                                timer: 10000
                            })
                        }
                    }
                    if (!isValidStockAllLines) {
                        return false;
                    }
                }
                let hasValidMinMaxPrice = selectedOrder.isValidMinMaxPrice()
                if (!hasValidMinMaxPrice) {
                    return false
                }
                const linePriceSmallerThanZero = selectedOrder.orderlines.models.find(l => l.get_price_with_tax() <= 0 && !l.coupon_program_id && !l.promotion)
                if (this.env.pos.config.validate_return && linePriceSmallerThanZero) {
                    let validate = await this.env.pos._validate_action(this.env._t('Have one Line has Price smaller than or equal 0. Need Manager Approve'));
                    if (!validate) {
                        return this.env.pos.chrome.showNotification(this.env._t('Warning'), this.env._t('Your POS active Validate Return, need Manager Approve'))
                    }
                }
                const lineIsCoupon = selectedOrder.orderlines.models.find(l => l.coupon_id || l.coupon_program_id);
                if (lineIsCoupon && this.env.pos.config.validate_coupon) {
                    let validate = await this.env.pos._validate_action(this.env._t('Order add coupon, required need Manager Approve'));
                    if (!validate) {
                        return this.env.pos.chrome.showNotification(this.env._t('Warning'), this.env._t('Your POS active Validate Coupon, need Manager Approve'))
                    }
                }
                if (this.env.pos.config.validate_payment) {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve Payment'));
                    if (!validate) {
                        return this.env.pos.chrome.showNotification(this.env._t('Warning'), this.env._t('Your POS active Validate Payment, need Manager Approve'))
                    }
                }
                if (selectedOrder.get_total_with_tax() <= 0 || selectedOrder.orderlines.length == 0) {
                    return this.env.pos.chrome.showNotification(this.env._t('Warning'), this.env._t('It not possible Total Paid smaller than 0'))
                }
                if (!selectedOrder.get_client()) {
                    this.showPopup('ConfirmPopup', {
                        title: this.env._t('Partial Order required Customer'),
                        body: this.env._t('Please set a Customer'),
                        disableCancelButton: true,
                    })
                    const {confirmed, payload: newClient} = await this.showTempScreen(
                        'ClientListScreen',
                        {client: null}
                    );
                    if (confirmed) {
                        selectedOrder.set_client(newClient);
                    } else {
                        return this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t('Required set Customer for Partial Order')
                        })
                    }
                }
                let lists = this.env.pos.payment_methods.filter((p) => (p.journal && p.pos_method_type && p.pos_method_type == 'default') || (!p.journal && !p.pos_method_type)).map((p) => ({
                    id: p.id,
                    item: p,
                    label: p.name
                }))
                let {confirmed, payload: paymentMethod} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Are you want do partial payment, register one part amount of Total Order'),
                    list: lists
                })
                if (confirmed) {
                    let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                        title: this.env._t('How much customer need register payment ?'),
                        startingValue: 0
                    })
                    if (confirmed) {
                        number = parseFloat(number)
                        if (number < 0) {
                            return this.showPopup('ErrorPopup', {
                                title: this.env._t('Error'),
                                body: this.env._t('Register Amount required Bigger than 0')
                            })
                        }
                        if (number > 0) { // TODO: only amount > 0, allow register payment
                            let paymentLines = selectedOrder.paymentlines.models
                            paymentLines.forEach(function (p) {
                                selectedOrder.remove_paymentline(p)
                            })
                            selectedOrder.add_paymentline(paymentMethod);
                            let paymentline = selectedOrder.selected_paymentline;
                            paymentline.set_amount(number);
                            selectedOrder.trigger('change', selectedOrder);
                        }
                        let order_ids = this.env.pos.push_single_order(selectedOrder, {
                            draft: true
                        })
                        this.showPopup('TextInputPopup', {
                            title: this.env._t('Receipt Number: ') + selectedOrder['name'],
                            startingValue: selectedOrder['name'],
                            confirmText: this.env._t('Ok'),
                            cancelText: this.env._t('Close'),
                        });
                        return this.showScreen('ReceiptScreen');
                    }
                } else {
                    let order_ids = this.env.pos.push_single_order(selectedOrder, {
                        draft: true
                    })
                    this.showPopup('TextInputPopup', {
                        title: this.env._t('Receipt Number: ') + selectedOrder['name'],
                        startingValue: selectedOrder['name'],
                        confirmText: this.env._t('Ok'),
                        cancelText: this.env._t('Close'),
                    });
                    return this.showScreen('ReceiptScreen');
                }
            }
        }

        async sendVoucherPdf() {
            let responseOfWhatsApp = await this.rpc({
                model: 'pos.config',
                method: 'send_pdf_via_whatsapp',
                args: [[], this.env.pos.config.id, 'Coupon', 'coupon.report_coupon_code', 78, '84902403918', 'PDF'],
            });
            if (responseOfWhatsApp && responseOfWhatsApp['id']) {
                return this.showPopup('ConfirmPopup', {
                    title: this.env._t('Successfully'),
                    body: this.env._t("Receipt send successfully to your Client's Phone WhatsApp: ") + mobile_no,
                    disableCancelButton: true,
                })
            } else {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t("Send Receipt is fail, please check WhatsApp API and Token of your pos config or Your Server turn off Internet"),
                    disableCancelButton: true,
                })
            }
        }

        async sendReceiptViaWhatsApp() {
            let fixture = document.createElement('div');
            const printer = new Printer();
            const order = this.env.pos.get_order()
            const orderReceipt = new (Registries.Component.get(OrderReceipt))(this, {order});
            await orderReceipt.mount(fixture);
            const receiptString = orderReceipt.el.outerHTML;
            const ticketImage = await printer.htmlToImg(receiptString);

            if (!order || order.get_orderlines().length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Your order is blank cart'),
                })
            }
            const client = order.get_client();
            let mobile_no = '';
            if (!client || (!client['mobile'] && !client['phone'])) {
                let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                    title: this.env._t("Order have not set Client or Client null Phone/Mobile. Please input Client's Mobile for send Receipt"),
                    startingValue: 0
                })
                if (confirmed) {
                    mobile_no = number
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t("Mobile Number is required"),
                        disableCancelButton: true,
                    })
                }
            } else {
                mobile_no = client.mobile || client.phone
            }
            let message = this.env.pos.config.whatsapp_message_receipt + ' ' + order['name'];
            let {confirmed, payload: messageNeedSend} = await this.showPopup('TextAreaPopup', {
                title: this.env._t('What message need to send Client ?'),
                startingValue: message
            })
            if (confirmed) {
                message = messageNeedSend
            }

            if (mobile_no) {
                let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Please review Mobile Number'),
                    body: mobile_no + this.env._t(" will use for send the Receipt, are you sure ? If you need change, please click Cancel button"),
                })
                if (confirmed) {
                    let responseOfWhatsApp = await this.rpc({
                        model: 'pos.config',
                        method: 'send_receipt_via_whatsapp',
                        args: [[], this.env.pos.config.id, ticketImage, mobile_no, message],
                    }, {
                        shadow: true,
                        timeout: 60000
                    });
                    if (responseOfWhatsApp && responseOfWhatsApp['id']) {
                        return this.showPopup('ConfirmPopup', {
                            title: this.env._t('Successfully'),
                            body: this.env._t("Receipt send successfully to your Client's Phone WhatsApp: ") + mobile_no,
                            disableCancelButton: true,
                        })
                    } else {
                        return this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t("Send Receipt is fail, please check WhatsApp API and Token of your pos config or Your Server turn off Internet"),
                            disableCancelButton: true,
                        })
                    }
                } else {
                    let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                        title: this.env._t("Please input WhatsApp Client's Mobile ?"),
                        startingValue: 0
                    })
                    if (confirmed) {
                        mobile_no = number
                        let responseOfWhatsApp = await this.rpc({
                            model: 'pos.config',
                            method: 'send_receipt_via_whatsapp',
                            args: [[], this.env.pos.config.id, ticketImage, mobile_no, message],
                        }, {
                            shadow: true,
                            timeout: 60000
                        });
                        if (responseOfWhatsApp && responseOfWhatsApp['id']) {
                            return this.showPopup('ConfirmPopup', {
                                title: this.env._t('Successfully'),
                                body: this.env._t("Receipt send successfully to your Client's Phone WhatsApp: ") + mobile_no,
                                disableCancelButton: true,
                            })
                        } else {
                            return this.env.pos.alert_message({
                                title: this.env._t('Error'),
                                body: this.env._t("Send Receipt is fail, please check WhatsApp API and Token of your pos config or Your Server turn off Internet"),
                                disableCancelButton: true,
                            })
                        }
                    }
                }
            } else {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t("Mobile Number is required"),
                    disableCancelButton: true,
                })
            }
        }

        async manualAddCouponPrograms() {
            let couponProgramsAutomatic = this.env.pos.couponProgramsAutomatic
            this.env.pos.couponProgramsAutomatic.forEach(function (c) {
                c.selected = false;
                c.display_name = c.name;
            })
            let {confirmed, payload: result} = await this.showPopup('PopUpSelectionBox', {
                title: this.env._t('Select Coupon Programs'),
                items: couponProgramsAutomatic
            })
            if (confirmed) {
                if (result.items.length) {
                    const couponsSelected = result.items
                    this.env.pos.automaticSetCoupon(couponsSelected)
                }
            }
        }

        async addCoupon() {
            const selectedOrder = this.env.pos.get_order()
            if (selectedOrder.orderlines.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your cart is blank. Please finish order products and use Promotion/Coupon Code')
                })
            }
            let {confirmed, payload: code} = await this.showPopup('TextInputPopup', {
                title: this.env._t('Promotion/Coupon Code ?'),
            })
            if (confirmed) {
                this.env.pos.getInformationCouponPromotionOfCode(code)
            }
        }

        async setServicesOrder() {
            const selectedOrder = this.env.pos.get_order();
            if (selectedOrder.orderlines.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your order cart is blank')
                })
            }
            const list = this.env.pos.services_charge.map(service => ({
                id: service.id,
                name: service.name,
                item: service
            }))
            let {confirmed, payload: selectedItems} = await this.showPopup(
                'PopUpSelectionBox',
                {
                    title: this.env._t('Please select one Service need add to Order'),
                    items: list,
                    onlySelectOne: true,
                }
            );
            if (confirmed && selectedItems['items'].length > 0) {
                const service = selectedItems['items'][0]['item']
                var product = this.env.pos.db.get_product_by_id(service['product_id'][0]);
                if (product) {
                    selectedOrder.add_shipping_cost(service, product, false)
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: service['product_id'][1] + this.env._t(' not available in POS. Please set this product available in POS before use this feature')
                    })
                }
            }
        }

        async signatureOrder() {
            const order = this.env.pos.get_order();
            const {confirmed, payload: values} = await this.showPopup('PopUpSignatureOrder', {
                title: this.env._t('Signature Order'),
            })
            if (confirmed) {
                if (!values.signature) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Signature not success, please try again')
                    })
                } else {
                    order.set_signature(values.signature)
                }
            }
        }

        get nGuests() {
            const order = this.env.pos.get_order();
            return order ? order.get_customer_count() : 0;
        }

        async setGuests() {
            const {confirmed, payload: inputNumber} = await this.showPopup('NumberPopup', {
                startingValue: this.nGuests,
                cheap: true,
                title: this.env._t('Guests ?'),
            });

            if (confirmed) {
                this.env.pos.get_order().set_customer_count(parseInt(inputNumber, 10) || 1);
            }
        }

        async transferItemsToAnotherTable() {
            const order = this.env.pos.get_order();
            if (order.get_orderlines().length > 0) {
                this.showScreen('SplitBillScreen');
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Please select Minimum 1 Item'),
                    body: this.env._t('And click to button "Transfer to another Table"'),
                    disableCancelButton: true,
                })
            }
        }

        async lockTable() {
            const selectedOrder = this.env.pos.get_order()
            const orders = this.env.pos.get('orders').models;
            let {confirmed, payload: selection} = await this.showPopup('SelectionPopup', {
                title: this.env._t('Selection Lock Type'),
                list: [
                    {
                        label: this.env._t('Only lock selected Order'),
                        item: true,
                        id: 1,
                    },
                    {
                        label: this.env._t('Lock all Orders have Items in Cart'),
                        item: false,
                        id: 2,
                    }
                ],
            })
            if (confirmed) {
                if (selection) {
                    return selectedOrder.lock_order()
                } else {
                    for (let i = 0; i < orders.length; i++) {
                        orders[i].lock_order()
                    }
                }
            }
        }

        get orderAutoPrintText() {
            if (this.env.pos.config.iface_print_auto) {
                return this.env._t('[On] Auto Print and Next Order')
            } else {
                return this.env._t('[Off] Auto Print and Next Order')
            }
        }

        get orderAutoPrint() {
            if (this.env.pos.config.iface_print_auto) {
                return true
            } else {
                return false
            }
        }

        async setAutoPrint() {
            if (this.env.pos.config.validate_order_without_receipt != this.env.pos.config.iface_print_auto) {
                this.env.pos.config.validate_order_without_receipt = true
                this.env.pos.config.iface_print_auto = true
            }
            this.env.pos.config.validate_order_without_receipt = !this.env.pos.config.validate_order_without_receipt
            this.env.pos.config.iface_print_auto = !this.env.pos.config.iface_print_auto
            if (this.env.pos.config.iface_print_auto) {
                this.env.pos.alert_message({
                    title: this.env._t('ON'),
                    body: this.env._t('Automatic Print Receipt, Validate and Next Order is [ON]'),
                    color: 'success'
                })
            } else {
                this.env.pos.alert_message({
                    title: this.env._t('OFF'),
                    body: this.env._t('Automatic Print Receipt, Validate and Next Order is [OFF]'),
                })
            }
            this.render()
        }

        async selectLoyaltyReward() {
            const selectedOrder = this.env.pos.get_order();
            var client = selectedOrder.get_client();
            if (!client) {
                const {confirmed, payload: newClient} = await this.env.pos.chrome.showTempScreen(
                    'ClientListScreen',
                    {client: null}
                );
                if (confirmed) {
                    selectedOrder.set_client(newClient);
                } else {
                    const {confirmed, payload: confirm} = await this.env.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Customer is required set to Order for checking points existing of Customer')
                    })
                    if (confirmed) {
                        const {confirmed, payload: newClient} = await this.env.pos.chrome.showTempScreen(
                            'ClientListScreen',
                            {client: null}
                        )
                        if (confirmed) {
                            selectedOrder.set_client(newClient);
                            return await this.selectLoyaltyReward()
                        }
                    }
                }

            }
            const list = this.env.pos.rewards.map(reward => ({
                id: reward.id,
                label: reward.name,
                isSelected: false,
                item: reward
            }))
            let {confirmed, payload: reward} = await this.env.pos.chrome.showPopup('SelectionPopup', {
                title: this.env._t('Please select one Reward need apply to customer'),
                list: list,
            });
            if (confirmed) {
                selectedOrder.setRewardProgram(reward)
            }
        }

        get currentPricelistName() {
            const order = this.env.pos.get_order();
            return order && order.pricelist
                ? order.pricelist.display_name
                : this.env._t('Pricelist');
        }

        async showReports() {
            let self = this;
            let list_report = [];
            if (this.env.pos.config.report_product_summary) {
                list_report.push({
                    'id': 1,
                    'name': 'Report Products Summary',
                    'item': 1
                })
            }
            if (this.env.pos.config.report_order_summary) {
                list_report.push({
                    'id': 2,
                    'name': 'Report Orders Summary',
                    'item': 2
                })
            }
            if (this.env.pos.config.report_payment_summary) {
                list_report.push({
                    'id': 3,
                    'name': 'Report Payment Summary',
                    'item': 3
                })
            }
            if (this.env.pos.config.report_sale_summary) {
                list_report.push({
                    'id': 4,
                    'name': 'Z-Report (Your Session Sale Summary)',
                    'item': 4
                })
            }
            list_report.push({
                'id': 5,
                'name': 'Sale Summary Detail of your Session',
                'item': 5
            })
            var to_date = new Date().toISOString().split('T')[0];
            var date = new Date();
            var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
            var from_date = firstDay.toISOString().split('T')[0];
            let {confirmed, payload: selectedReports} = await this.showPopup(
                'PopUpSelectionBox',
                {
                    title: this.env._t('Select the report'),
                    items: list_report,
                    onlySelectOne: true,
                }
            );
            if (confirmed && selectedReports['items'].length > 0) {
                const selectedReport = selectedReports['items'][0]
                if (selectedReport && selectedReport['id']) {
                    const report_id = selectedReport['id']
                    if (report_id == 1) {
                        let defaultProps = {
                            title: this.env._t('Products Summary Report'),
                            current_session_report: true,
                            from_date: from_date,
                            to_date: to_date,
                            report_product_summary_auto_check_product: this.env.pos.config.report_product_summary_auto_check_product,
                            report_product_summary_auto_check_category: this.env.pos.config.report_product_summary_auto_check_category,
                            report_product_summary_auto_check_location: this.env.pos.config.report_product_summary_auto_check_location,
                            report_product_summary_auto_check_payment: this.env.pos.config.report_product_summary_auto_check_payment,
                        }
                        let {
                            confirmed,
                            payload: result
                        } = await this.showPopup('PopUpReportProductsSummary', defaultProps)
                        if (confirmed) {
                            this.buildProductsSummaryReport(result.values);
                        }
                    }
                    if (report_id == 2) {
                        let defaultProps = {
                            title: this.env._t('Orders Summary Report'),
                            current_session_report: true,
                            from_date: from_date,
                            to_date: to_date,
                            report_order_summary_auto_check_order: this.env.pos.config.report_order_summary_auto_check_order,
                            report_order_summary_auto_check_category: this.env.pos.config.report_order_summary_auto_check_category,
                            report_order_summary_auto_check_payment: this.env.pos.config.report_order_summary_auto_check_payment,
                            report_order_summary_default_state: this.env.pos.config.report_order_summary_default_state,
                        }
                        let {
                            confirmed,
                            payload: result
                        } = await this.showPopup('PopUpReportsOrdersSummary', defaultProps)
                        if (confirmed) {
                            this.buildOrdersSummaryReport(result.values);
                        }
                    }
                    if (report_id == 3) {
                        let defaultProps = {
                            title: this.env._t('Payments Summary Report'),
                            current_session_report: true,
                            from_date: from_date,
                            to_date: to_date,
                            summary: 'sales_person',
                        }
                        let {
                            confirmed,
                            payload: result
                        } = await this.showPopup('PopUpReportPaymentsSummary', defaultProps)
                        if (confirmed) {
                            this.buildPaymentsSummaryReport(result.values);
                        }

                    }
                    if (report_id == 4) {
                        let params = {
                            model: 'pos.session',
                            method: 'build_sessions_report',
                            args: [[this.env.pos.pos_session.id]],
                        };
                        let values = await this.rpc(params, {shadow: true}).then(function (values) {
                            return values
                        }, function (err) {
                            return self.env.pos.query_backend_fail(err);
                        })
                        let reportData = values[this.env.pos.pos_session.id];
                        let start_at = field_utils.parse.datetime(reportData.session.start_at);
                        start_at = field_utils.format.datetime(start_at);
                        reportData['start_at'] = start_at;
                        if (reportData['stop_at']) {
                            var stop_at = field_utils.parse.datetime(reportData.session.stop_at);
                            stop_at = field_utils.format.datetime(stop_at);
                            reportData['stop_at'] = stop_at;
                        }
                        let reportHtml = qweb.render('ReportSalesSummarySession', {
                            pos: this.env.pos,
                            report: reportData,
                        });
                        let reportXml = qweb.render('ReportSalesSummarySessionXml', {
                            pos: this.env.pos,
                            report: reportData,
                        });
                        this.showScreen('ReportScreen', {
                            report_html: reportHtml,
                            report_xml: reportXml
                        });
                    }
                    if (report_id == 5) {
                        let result = await this.rpc({
                            model: 'report.point_of_sale.report_saledetails',
                            method: 'get_sale_details',
                            args: [false, false, false, [this.env.pos.pos_session.id]],
                        }, {
                            shadow: true,
                            timeout: 65000
                        }).then(function (result) {
                            return result
                        }, function (err) {
                            return self.env.pos.query_backend_fail(err);
                        });
                        var env = {
                            company: this.env.pos.company,
                            pos: this.env.pos,
                            products: result.products,
                            payments: result.payments,
                            taxes: result.taxes,
                            total_paid: result.total_paid,
                            date: (new Date()).toLocaleString(),
                        };
                        let report_html = qweb.render('ReportSalesDetail', env);
                        let report_xml = qweb.render('ReportSalesDetailXml', env);
                        this.showScreen('ReportScreen', {
                            report_html: report_html,
                            report_xml: report_xml
                        });
                    }
                }
            }
        }

        async buildProductsSummaryReport(values) {
            var self = this;
            let summary = [];
            if (values['report_product_summary_auto_check_product']) {
                summary.push('product_summary')
            }
            if (values['report_product_summary_auto_check_category']) {
                summary.push('category_summary')
            }
            if (values['report_product_summary_auto_check_location']) {
                summary.push('location_summary')
            }
            if (values['report_product_summary_auto_check_payment']) {
                summary.push('payment_summary')
            }
            let val = null;
            if (values.current_session_report) {
                val = {
                    'from_date': null,
                    'to_date': null,
                    'summary': summary,
                    'session_id': this.env.pos.pos_session.id,
                };
            } else {
                if (!values.from_date || !values.to_date) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('From or To Date is missed, required input')
                    })
                }
                val = {
                    'from_date': values.from_date,
                    'to_date': values.to_date,
                    'summary': summary
                };
            }
            let params = {
                model: 'pos.order',
                method: 'product_summary_report',
                args: [val],
            };
            let results = await this.rpc(params).then(function (result) {
                return result
            }, function (err) {
                self.env.pos.query_backend_fail(err);
                return false;
            })
            this.renderProductsSummaryReport(values, results)
        }

        renderProductsSummaryReport(values, results) {
            if (Object.keys(results['category_summary']).length == 0 && Object.keys(results['product_summary']).length == 0 &&
                Object.keys(results['location_summary']).length == 0 && Object.keys(results['payment_summary']).length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Data not found for report')
                })
            } else {
                var product_total_qty = 0.0;
                var category_total_qty = 0.0;
                var payment_summary_total = 0.0;
                if (results['product_summary']) {
                    _.each(results['product_summary'], function (value, key) {
                        product_total_qty += value.quantity;
                    });
                }
                if (results['category_summary']) {
                    _.each(results['category_summary'], function (value, key) {
                        category_total_qty += value;
                    });
                }
                if (results['payment_summary']) {
                    _.each(results['payment_summary'], function (value, key) {
                        payment_summary_total += value;
                    });
                }
                var product_summary;
                var category_summary;
                var payment_summary;
                var location_summary;
                if (Object.keys(results['product_summary']).length) {
                    product_summary = true;
                }
                if (Object.keys(results['category_summary']).length) {
                    category_summary = true;
                }
                if (Object.keys(results['payment_summary']).length) {
                    payment_summary = true;
                }
                if (Object.keys(results['location_summary']).length) {
                    location_summary = true;
                }
                var values = {
                    pos: this.env.pos,
                    from_date: values.from_date,
                    to_date: values.to_date,
                    product_total_qty: product_total_qty,
                    category_total_qty: category_total_qty,
                    payment_summary_total: payment_summary_total,
                    product_summary: product_summary,
                    category_summary: category_summary,
                    payment_summary: payment_summary,
                    location_summary: location_summary,
                    summary: results,
                };
                let report_html = qweb.render('ReportProductsSummary', values);
                let report_xml = qweb.render('ReportProductsSummaryXml', values);
                this.showScreen('ReportScreen', {
                    report_html: report_html,
                    report_xml: report_xml
                });
            }
        }

        async buildOrdersSummaryReport(values) {
            var self = this;
            let summary = [];
            if (values['report_order_summary_auto_check_order']) {
                summary.push('order_summary_report')
            }
            if (values['report_order_summary_auto_check_category']) {
                summary.push('category_summary_report')
            }
            if (values['report_order_summary_auto_check_payment']) {
                summary.push('payment_summary_report')
            }
            let val = null;
            if (values.current_session_report) {
                val = {
                    'from_date': null,
                    'to_date': null,
                    'summary': summary,
                    'session_id': this.env.pos.pos_session.id,
                    'state': values['report_order_summary_default_state']
                };
            } else {
                if (!values.from_date || !values.to_date) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('From or To Date is missed, required input')
                    })
                }
                val = {
                    'from_date': values.from_date,
                    'to_date': values.to_date,
                    'state': values['report_order_summary_default_state'],
                    'summary': summary
                };
            }
            let params = {
                model: 'pos.order',
                method: 'order_summary_report',
                args: [val],
            };
            let results = await this.rpc(params).then(function (result) {
                return result
            }, function (err) {
                self.env.pos.query_backend_fail(err);
                return false;
            })
            this.renderOrdersSummaryReport(values, results)
        }

        renderOrdersSummaryReport(values, results) {
            var state = results['state'];
            if (results) {
                if (Object.keys(results['category_report']).length == 0 && Object.keys(results['order_report']).length == 0 &&
                    Object.keys(results['payment_report']).length == 0) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Data not found for report')
                    })
                } else {
                    var category_report;
                    var order_report;
                    var payment_report;
                    if (Object.keys(results.order_report).length == 0) {
                        order_report = false;
                    } else {
                        order_report = results['order_report']
                    }
                    if (Object.keys(results.category_report).length == 0) {
                        category_report = false;
                    } else {
                        category_report = results['category_report']
                    }
                    if (Object.keys(results.payment_report).length == 0) {
                        payment_report = false;
                    } else {
                        payment_report = results['payment_report']
                    }
                    var values = {
                        pos: this.env.pos,
                        state: state,
                        from_date: values.from_date,
                        to_date: values.to_date,
                        order_report: order_report,
                        category_report: category_report,
                        payment_report: payment_report,
                    };
                    let report_html = qweb.render('ReportOrdersSummary', values);
                    let report_xml = qweb.render('ReportOrdersSummaryXml', values)
                    this.showScreen('ReportScreen', {
                        report_html: report_html,
                        report_xml: report_xml
                    });
                }
            }


        }

        async buildPaymentsSummaryReport(values) {
            var self = this;
            let summary = values.summary;
            let val = null;
            if (values.current_session_report) {
                val = {
                    'summary': summary,
                    'session_id': this.env.pos.pos_session.id,
                };
            } else {
                if (!values.from_date || !values.to_date) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('From or To Date is missed, required input')
                    })
                }
                val = {
                    'from_date': values.from_date,
                    'to_date': values.to_date,
                    'summary': summary
                };
            }
            let params = {
                model: 'pos.order',
                method: 'payment_summary_report',
                args: [val],
            };
            let results = await this.rpc(params).then(function (result) {
                return result
            }, function (err) {
                self.env.pos.query_backend_fail(err);
                return false;
            })
            this.renderPaymentsSummaryReport(values, results)
        }

        renderPaymentsSummaryReport(values, results) {
            if (Object.keys(results['journal_details']).length == 0 && Object.keys(results['salesmen_details']).length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Data not found for report')
                })
            } else {
                var journal_key = Object.keys(results['journal_details']);
                if (journal_key.length > 0) {
                    var journal_details = results['journal_details'];
                } else {
                    var journal_details = false;
                }
                var sales_key = Object.keys(results['salesmen_details']);
                if (sales_key.length > 0) {
                    var salesmen_details = results['salesmen_details'];
                } else {
                    var salesmen_details = false;
                }
                var total = Object.keys(results['summary_data']);
                if (total.length > 0) {
                    var summary_data = results['summary_data'];
                } else {
                    var summary_data = false;
                }
                var values = {
                    from_date: values.from_date,
                    to_date: values.to_date,
                    pos: this.env.pos,
                    journal_details: journal_details,
                    salesmen_details: salesmen_details,
                    summary_data: summary_data
                };
                let report_html = qweb.render('ReportPaymentsSummary', values);
                let report_xml = qweb.render('ReportPaymentsSummaryXml', values)
                this.showScreen('ReportScreen', {
                    report_html: report_html,
                    report_xml: report_xml
                });
            }
        }

    }

    ListFeaturesButtons.template = 'ListFeaturesButtons';

    Registries.Component.add(ListFeaturesButtons);

    return ListFeaturesButtons;
});
