odoo.define('pos_retail.OrderReceipt', function (require) {
    'use strict';

    const Registries = require('point_of_sale.Registries');
    const OrderReceipt = require('point_of_sale.OrderReceipt');
    const {useState} = owl.hooks;

    const RetailOrderReceipt = (OrderReceipt) =>
        class extends OrderReceipt {
            constructor() {
                super(...arguments);
                this.state = useState({
                    orderRequest: this.props.orderRequest,
                });
                this._receiptEnv = this.env.pos.getReceiptEnv();
                // if (this.props.orderRequest) {
                //     this.orderRequest = this.props.orderRequest
                // }
                if (!this._receiptEnv) { // reprint at order management
                    this._receiptEnv = this.props.order.getOrderReceiptEnv();
                }
                if (this._receiptEnv && this._receiptEnv.order_fields_extend) {
                    this.order_fields_extend = this._receiptEnv.order_fields_extend
                } else {
                    this.order_fields_extend = null
                }
                if (this._receiptEnv && this._receiptEnv.delivery_fields_extend) {
                    this.delivery_fields_extend = this._receiptEnv.delivery_fields_extend
                } else {
                    this.delivery_fields_extend = null
                }
                if (this._receiptEnv && this._receiptEnv.invoice_fields_extend) {
                    this.invoice_fields_extend = this._receiptEnv.invoice_fields_extend
                } else {
                    this.invoice_fields_extend = null
                }
            }

            mounted() {
                if (!this.props.orderRequest && this.env.pos.printers && this.env.pos.printers.length != 0 && this.props.order) {
                    const printers = this.env.pos.printers;
                    const currentOrder = this.props.order
                    currentOrder.orderlines.models.forEach(l => {
                        if (l.mp_dbclk_time != 0 && l.mp_skip) {
                            this.mp_dbclk_time = 0
                            l.set_skip(false) // skipped is Product is Main Course
                        }
                    })
                    let orderRequest = null
                    for (let i = 0; i < printers.length; i++) {
                        let printer = printers[i];
                        let changes = currentOrder.computeChanges(printer.config.product_categories_ids);
                        if (changes['new'].length > 0 || changes['cancelled'].length > 0) {
                            let orderReceipt = currentOrder.buildReceiptKitchen(changes);
                            orderRequest = orderReceipt
                            if ((currentOrder.syncing == false || !currentOrder.syncing) && this.env.pos.pos_bus && !this.env.pos.splitbill) {
                                this.env.pos.pos_bus.requests_printers.push({
                                    action: 'request_printer',
                                    data: {
                                        uid: currentOrder.uid,
                                        computeChanges: orderReceipt,
                                    },
                                    order_uid: currentOrder.uid,
                                })
                            }
                            this.state.orderRequest = orderRequest
                        }
                    }
                }
                super.mounted();
            }


            willUpdateProps(nextProps) {
                if (nextProps.order) { // restaurant has error when back to floor sreeen, order is null and nextProps.order is not found
                    super.willUpdateProps(nextProps)
                } else {
                    console.warn('Your POS active iface_print_skip_screen, please turn it off. This feature make lose order')
                }
            }

            get orderFieldsExtend() {
                return this.order_fields_extend
            }

            get orderRequest() {
                return this.state.orderRequest
            }

            get deliveryFieldsExtend() {
                return this.delivery_fields_extend
            }

            get invoiceFieldsExtend() {
                return this.invoice_fields_extend
            }

        }

    Registries.Component.extend(OrderReceipt, RetailOrderReceipt);
    if (self.odoo.session_info && self.odoo.session_info['config']['receipt_template'] == 'retail') {
        OrderReceipt.template = 'RetailOrderReceipt';
    }
    if (self.odoo.session_info && self.odoo.session_info['config']['receipt_template'] == 'arabic') {
        OrderReceipt.template = 'ArabicReceipt';
    }

    Registries.Component.add(RetailOrderReceipt);
    return OrderReceipt;
});

