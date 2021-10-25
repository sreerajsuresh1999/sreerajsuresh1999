odoo.define('pos_restaurant.SubmitProductsMainCourse', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const QWeb = core.qweb;

    /**
     * IMPROVEMENT: Perhaps this class is quite complicated for its worth.
     * This is because it needs to listen to changes to the current order.
     * Also, the current order changes when the selectedOrder in pos is changed.
     * After setting new current order, we update the listeners.
     */
    class SubmitProductsMainCourse extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
            this._currentOrder = this.env.pos.get_order();
            this._currentOrder.orderlines.on('change', this.render, this);
            this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
        }

        willUnmount() {
            this._currentOrder.orderlines.off('change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        get countItemsNeedPrint() {
            const selectedOrder = this.env.pos.get_order();
            if (!selectedOrder) {
                return 0
            }
            let countItemsNeedToPrint = 0
            let printers = this.env.pos.printers;
            for (let i = 0; i < printers.length; i++) {
                let changes = selectedOrder.computeChanges(printers[i].config.product_categories_ids);
                if (changes['new'].length > 0 || changes['cancelled'].length > 0) {
                    countItemsNeedToPrint += changes['new'].length
                    countItemsNeedToPrint += changes['cancelled'].length
                }
            }
            return countItemsNeedToPrint
        }

        showReceipt() {
            var printers = this.env.pos.printers;
            const selectedOrder = this.env.pos.get_order()
            for (var i = 0; i < printers.length; i++) {
                var changes = selectedOrder.computeChanges(printers[i].config.product_categories_ids);
                if (changes['new'].length > 0 || changes['cancelled'].length > 0) {
                    let orderReceipt = selectedOrder.buildReceiptKitchen(changes);
                    let receipt_html = QWeb.render('OrderChangeReceipt', {
                        changes: orderReceipt,
                        widget: selectedOrder
                    });
                    let report_xml = QWeb.render('KitchenReceiptXml', {changes: orderReceipt, widget: selectedOrder});
                    this.showScreen('ReportScreen', {
                        report_html: receipt_html,
                        report_xml: report_xml,
                    });
                    if ((selectedOrder.syncing == false || !selectedOrder.syncing) && this.env.pos.pos_bus && !this.env.pos.splitbill) {
                        this.env.pos.pos_bus.requests_printers.push({
                            action: 'request_printer',
                            data: {
                                uid: selectedOrder.uid,
                                computeChanges: orderReceipt,
                            },
                            order_uid: selectedOrder.uid,
                        })
                    }
                }
            }
            return true;
        }

        async onClick() {
            const changes = this._currentOrder.hasChangesToPrint();
            const skipped = changes ? false : this._currentOrder.hasSkippedChanges();
            if (!skipped) {
                return this.env.pos.chrome.showNotification(this.env._t('Alert'), this.env._t('Have not any Lines in Cart is Main Course need send to Kitchen Printer'))
            }
            this._currentOrder.orderlines.models.forEach(l => {
                if (l.mp_dbclk_time != 0 && l.mp_skip) {
                    this.mp_dbclk_time = 0
                    l.set_skip(false)
                }
            })
            if (this._currentOrder.hasChangesToPrint()) {
                const isPrintSuccessful = await this._currentOrder.printChanges();
                this.showReceipt()
                if (isPrintSuccessful) {
                    this._currentOrder.saveChanges();
                } else {
                    this.env.pos.alert_message({
                        title: 'Printing failed',
                        body: 'Failed in printing the changes in the order',
                    });
                }
                return this.env.pos.chrome.showNotification(this.env._t('Alert'), this.env._t('Order submitted to Kitchen Screen'))
            }
        }

        get addedClasses() {
            if (!this._currentOrder) return {};
            const changes = this._currentOrder.hasChangesToPrint();
            const skipped = changes ? false : this._currentOrder.hasSkippedChanges();
            return {
                highlight: skipped,
                altlight: changes,
            };
        }

        _updateCurrentOrder(pos, newSelectedOrder) {
            this._currentOrder.orderlines.off('change', null, this);
            if (newSelectedOrder) {
                this._currentOrder = newSelectedOrder;
                this._currentOrder.orderlines.on('change', this.render, this);
            }
        }
    }

    SubmitProductsMainCourse.template = 'SubmitProductsMainCourse';

    ProductScreen.addControlButton({
        component: SubmitProductsMainCourse,
        condition: function () {
            let allowDisplayButton = false
            let config_ids = []
            for (let i=0; i < this.env.pos.printers; i++) {
                config_ids =  config_ids.concat(this.env.pos.printers[i]['config']['product_categories_ids'])
            }
            for (let i=0; i < config_ids.length; i++) {
                let config_id = config_ids[i]
                let config = this.env.pos.db.category_by_id[config_id]
                if (config['category_type'] == 'main') {
                    allowDisplayButton = true
                    break
                }
            }
            return allowDisplayButton;
        },
        position: ['after', 'SubmitOrderButton'],
    });

    Registries.Component.add(SubmitProductsMainCourse);

    return SubmitProductsMainCourse;
});
