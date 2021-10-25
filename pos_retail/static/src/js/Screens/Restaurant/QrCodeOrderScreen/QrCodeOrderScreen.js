odoo.define('pos_retail.QrCodeOrderScreen', function (require) {
    'use strict';

    const {debounce} = owl.utils;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const {posbus} = require('point_of_sale.utils');
    const IndependentToOrderScreen = require('point_of_sale.IndependentToOrderScreen');
    const {onChangeOrder, useBarcodeReader} = require('point_of_sale.custom_hooks');
    const models = require('point_of_sale.models');
    const bus = require('pos_retail.core_bus');

    class QrCodeOrderScreen extends IndependentToOrderScreen {
        constructor() {
            super(...arguments);
            this.orders = this.env.pos.db.getQrCodeOrders()
            const qr_orders = JSON.parse(this.env.pos.config.qr_orders);
            if (this.orders.length == 0) {
                this.orders = qr_orders
            }
            this.state = {
                orders: this.orders,
                query: null,
                selectedOrder: this.props.selectedOrder || null,
                detailIsShown: false,
                isEditMode: false,
                editModeProps: {
                    order: null
                },
            };
            if (this.props.selectedOrder) {
                this.state.detailIsShown = true
                this.state.editModeProps.order = this.props.selectedOrder
            }
            this.updateOrderList = debounce(this.updateOrderList, 70);
            useListener('close-screen', this.back);
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
            this.searchDetails = {};
            this.filter = null;
            this._initializeSearchFieldConstants();
            useBarcodeReader({
                restaurant_order: this._scanRestaurantOrder,
            })
            posbus.on('user-confirm-place-order', this, this.userConfirmPlaceOrder);
        }

        // Lifecycle hooks
        back() {
            if (this.state.detailIsShown) {
                this.state.detailIsShown = false;
                this.render();
            } else {
                this.close()
            }
        }

        _scanRestaurantOrder(codeData) {
            const code = codeData.code;
            let order = this.env.pos.db.getQrCodeOrderbyEan13(code)
            if (order) {
                this.state.selectedOrder = order;
                this.state.detailIsShown = true
                this.state.editModeProps.order = order
                this.render()
            } else {
                this._barcodeErrorAction(codeData);
            }
        }

        _barcodeErrorAction(code) {
            this.showPopup('ErrorBarcodePopup', {code: this._codeRepr(code)});
        }

        _codeRepr(code) {
            if (code.code.length > 32) {
                return code.code.substring(0, 29) + '...';
            } else {
                return code.code;
            }
        }

        willPatch() {
            posbus.off('save-qrcode-order', this);
        }

        patched() {
            posbus.on('save-qrcode-order', this, this.reloadScreen);
        }

        mounted() {
            posbus.on('save-qrcode-order', this, this.reloadScreen);
            this._tableLongpolling();
            this.tableLongpolling = setInterval(this._tableLongpolling.bind(this), 5000);
        }

        willUnmount() {
            posbus.off('save-qrcode-order', this);
            clearInterval(this.tableLongpolling);
        }

        userConfirmPlaceOrder(uid) {
            this.state.orders = this.orderList;
            this.render()
            console.log('=> auto confirm from bus.bus with uid: ' + uid)
            const order = this.state.orders.find(o => o.uid == uid)
            if (order) {
                const event = {
                    'detail': {
                        order: order
                    }
                }
                this.actionConfirm(event)
            } else {
                console.warn('Not Found order uid: ' + uid);
            }
            this.reloadScreen()
        }

        _tableLongpolling() {
            try {
                this.rpc({
                    model: 'pos.config',
                    method: 'save_qr_orders',
                    args: [this.env.pos.config.id, this.state.orders],
                })
            } catch (error) {
                if (error.message.code < 0) {
                    console.error(error.message)
                } else {
                    throw error;
                }
            }
        }

        async actionRemove(event) {
            const order = event.detail.order
            this.env.pos.db.removeQrCodeOrder(order.uid)
            this.reloadScreen()
            this.env.pos.pos_bus.send_notification({
                data: this.env._t('Order removed by Cashier'),
                action: 'cashier_activity',
                order_uid: order.uid,
            });
        }

        async actionConfirm(event) {
            const self = this;
            const order = event.detail.order
            const ordersTheSameTable = this.state.orders.filter(o => o.table_id && o.table_id == order.table_id && o.state == 'Waiting')
            for (let i = 0; i < ordersTheSameTable.length; i++) {
                let orderWillConfirm = ordersTheSameTable[i]
                this.env.pos.db.setStateQrCodeOrder(orderWillConfirm.uid, 'Confirmed')
                const ordersOfSession = this.env.pos.get('orders').models
                let orderTheSameTable = ordersOfSession.find(o => o.table && o.table.id == orderWillConfirm.table_id)
                if (!orderTheSameTable) {
                    orderTheSameTable = this.env.pos.sync_new_order(orderWillConfirm)
                    this.env.pos.set('selectedOrder', orderTheSameTable);
                } else {
                    orderWillConfirm.lines.forEach(l => {
                        let line = l[2];
                        let product_id = line.product_id;
                        var product = self.env.pos.db.get_product_by_id(product_id);
                        if (!product) {
                            console.warn('Product Id: ' + product_id + ' not exist in this session');
                            return false;
                        }
                        orderTheSameTable.add_orderline(new models.Orderline({}, {
                            pos: self.env.pos,
                            order: orderTheSameTable,
                            json: line
                        }));
                    })
                    this.env.pos.set('selectedOrder', orderTheSameTable);
                }
                if (orderTheSameTable.customer_count <= 1) {
                    orderTheSameTable.set_customer_count(orderWillConfirm.customer_count)
                }
                this.env.pos.set_table(orderTheSameTable.table)
                this.env.pos.db.removeQrCodeOrder(orderWillConfirm.uid)
                this.close()
                this.env.pos.pos_bus.send_notification({
                    data: this.env._t('Order just Confirmed by Cashier'),
                    action: 'cashier_activity',
                    order_uid: orderWillConfirm.uid,
                });
            }
        }

        async actionCancel(event) {
            const order = event.detail.order
            this.env.pos.db.setStateQrCodeOrder(order.uid, 'Cancelled')
            this.reloadScreen()
            this.env.pos.pos_bus.send_notification({
                data: this.env._t('Order just Cancelled by Cashier'),
                action: 'cashier_activity',
                order_uid: order.uid,
            });
        }

        async actionResetDraft(event) {
            const order = event.detail.order
            this.env.pos.db.setStateQrCodeOrder(order.uid, 'Waiting')
            this.reloadScreen()
        }

        reloadScreen() {
            if (this.state.selectedOrder) {
                let orders = this.env.pos.db.getQrCodeOrders()
                let orderJustUpdated = orders.find(o => o.uid == this.state.selectedOrder.uid)
                if (orderJustUpdated) {
                    this.state.editModeProps = {
                        order: orderJustUpdated,
                    };
                    this.state.detailIsShown = true;
                } else {
                    this.state.editModeProps = {
                        order: null,
                    };
                    this.state.detailIsShown = false;
                }
            }
            this.render()
        }

        async clearScreen() {
            const self = this;
            let orders = this.orderList;
            let ordersWaiting = orders.filter(o => o.state == 'Waiting')
            this.state.editModeProps = {
                order: null,
            };
            this.state.detailIsShown = false;
            if (ordersWaiting.length > 0) {
                let {confirmed, payload: isOk} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Have total ') + ordersWaiting.length + this.env._t(' (Orders) still Waiting Confirm. Are you sure remove it ?')
                })
                if (confirmed) {
                    ordersWaiting.forEach(o => {
                        self.env.pos.pos_bus.send_notification({
                            data: self.env._t('Order just Removed by Cashier'),
                            action: 'cashier_activity',
                            order_uid: o.uid,
                        });
                    })
                    this.env.pos.db.removeAllQrCodeOrder()
                    this.render()
                }
            } else {
                this.env.pos.db.removeAllQrCodeOrder()
                this.render()
            }
        }

        async clearOrdersDone() {
            this.state.editModeProps = {
                order: null,
            };
            this.state.detailIsShown = false;
            this.env.pos.db.removeAllQrCodeOrderHasDone()
            this.render()
        }

        get getOrders() {
            const filterCheck = (order) => {
                if (this.filter && this.filter !== 'All Orders') {
                    const state = order.state;
                    return this.filter === this.constants.stateSelectionFilter[state];
                }
                return true;
            };
            const {fieldValue, searchTerm} = this.searchDetails;
            const fieldAccessor = this._searchFields[fieldValue];
            const searchCheck = (order) => {
                if (!fieldAccessor) return true;
                const fieldValue = fieldAccessor(order);
                if (fieldValue === null) return true;
                if (!searchTerm) return true;
                return fieldValue && fieldValue.toString().toLowerCase().includes(searchTerm.toLowerCase());
            };
            const predicate = (order) => {
                return filterCheck(order) && searchCheck(order);
            };
            let orders = this.orderList.filter(predicate);
            return orders
        }

        get isNextButtonVisible() {
            return this.state.selectedOrder ? true : false;
        }

        // Methods

        // We declare this event handler as a debounce function in
        // order to lower its trigger rate.
        updateOrderList(event) {
            this.state.query = event.target.value;
            // const clients = this.clients;
            // if (event.code === 'Enter' && clients.length === 1) {
            //     this.state.selectedOrder = clients[0];
            //     this.clickNext();
            // } else {
            //     this.render();
            // }
        }

        clickOrder(event) {
            let order = event.detail.order;
            if (this.state.selectedOrder && this.state.selectedOrder.uid === order.uid) {
                this.state.selectedOrder = null;
                this.state.detailIsShown = false;
            } else {
                this.state.selectedOrder = order;
                this.state.detailIsShown = true;
            }
            this.state.editModeProps['order'] = this.state.selectedOrder

            this.render();
        }

        clickNext() {
            this.state.selectedOrder = this.nextButton.command === 'set' ? this.state.selectedOrder : null;
            this.confirm();
        }

        clearSearch() {
            this._initializeSearchFieldConstants()
            this.filter = this.filterOptions[0];
            this.searchDetails = {};
            this.state.editModeProps = {
                selectedOrder: null,
            };
            this.state.detailIsShown = false;
            this.render()
        }


        // TODO: ==================== Seach bar example ====================

        get searchBarConfig() {
            return {
                searchFields: this.constants.searchFieldNames,
                filter: {show: true, options: this.filterOptions},
            };
        }

        // TODO: define search fields
        get _searchFields() {
            var fields = {
                'Name': (order) => order.name,
                'Ean13': (order) => order.ean13,
                'Notes': (order) => order.note,
                'Created Time  (hh:mm)': (order) => moment(order.created_time).format('hh:mm'),
            };
            return fields;
        }

        // TODO: define group filters
        get filterOptions() { // list state for filter
            let filterOptions = [
                'All Orders',
                'Waiting',
                'Confirmed',
                'Cancelled',
            ];
            if (!this.env.pos.tables) {
                return filterOptions
            } else {
                this.env.pos.tables.forEach(t => filterOptions.push(t.name))
                return filterOptions
            }
        }

        get _stateSelectionFilter() {
            if (!this.env.pos.tables) {
                return {
                    Waiting: 'Waiting',
                    Confirmed: 'Confirmed',
                    Cancelled: 'Cancelled',
                };
            } else {
                let selectionFilter = {
                    Waiting: 'Waiting',
                    Confirmed: 'Confirmed',
                    Cancelled: 'Cancelled',
                };
                this.env.pos.tables.forEach(t => selectionFilter[t.name] = t.name)
                return selectionFilter
            }

        }

        // TODO: register search bar
        _initializeSearchFieldConstants() {
            this.constants = {};
            Object.assign(this.constants, {
                searchFieldNames: Object.keys(this._searchFields),
                stateSelectionFilter: this._stateSelectionFilter,
            });
        }

        // TODO: save filter selected on searchbox of user for getOrders()
        _onFilterSelected(event) {
            this.filter = event.detail.filter;
            this.render();
        }

        // TODO: save search detail selected on searchbox of user for getOrders()
        _onSearch(event) {
            const searchDetails = event.detail;
            Object.assign(this.searchDetails, searchDetails);
            this.render();
        }

        // TODO: return orders of system
        get orderList() {
            let orderList = this.env.pos.db.getQrCodeOrders()
            orderList = orderList.sort(this.env.pos.sort_by('created_time', true, function (a) {
                if (!a) {
                    a = 'N/A';
                }
                return a.toUpperCase()
            }));
            return orderList
        }
    }

    QrCodeOrderScreen.template = 'QrCodeOrderScreen';

    Registries.Component.add(QrCodeOrderScreen);

    return QrCodeOrderScreen;
});
