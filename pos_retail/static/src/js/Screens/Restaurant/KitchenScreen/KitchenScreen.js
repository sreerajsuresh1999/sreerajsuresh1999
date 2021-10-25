odoo.define('pos_retail.KitchenScreen', function (require) {
    'use strict';

    const IndependentToOrderScreen = require('point_of_sale.IndependentToOrderScreen');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const OrderReceipt = require('point_of_sale.OrderReceipt');
    const {posbus} = require('point_of_sale.utils');
    const core = require('web.core');
    const QWeb = core.qweb;

    class KitchenScreen extends IndependentToOrderScreen {
        constructor() {
            super(...arguments);
            useListener('click-view', () => this.viewOrder());
            this.orders = this.env.pos.db.getOrderReceipts();
            const orderTicketsBackup = JSON.parse(this.env.pos.config.order_receipt_tickets);
            if (this.orders.length == 0) {
                this.orders = orderTicketsBackup
            }
            this.state = {
                query: null,
                selectedOrder: this.props.selectedOrder,
                orders: this.orders || []
            };
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
            useListener('close-screen', this.close);
            this.searchDetails = {};
            this.filter = null;
            this._initializeSearchFieldConstants();
            if (this.env.pos.config.screen_type != 'kitchen') {
                this.removeEvents();
                this.initEvents();
            }
        }

        initEvents() {
            posbus.on('syncTransferSucceedReceipt', this, this.syncTransferSucceedReceipt);
            posbus.on('orderReceiptRemoved', this, this.orderReceiptRemoved);
            posbus.on('newOrderReceiptsComing', this, this.newOrderReceiptsComing);
            posbus.on('reloadKitchenScreen', this, this.reloadKitchenScreen);
            posbus.on('orderTransferTable', this, this.orderTransferTable);
        }

        removeEvents() {
            posbus.off('syncTransferSucceedReceipt', this, null);
            posbus.off('orderReceiptRemoved', this, null);
            posbus.off('newOrderReceiptsComing', this, null);
            posbus.off('reloadKitchenScreen', this, null);
            posbus.off('orderTransferTable', this, null);
            posbus['subscriptions']['syncTransferSucceedReceipt'] = [];
            posbus['subscriptions']['orderReceiptRemoved'] = [];
            posbus['subscriptions']['newOrderReceiptsComing'] = [];
            posbus['subscriptions']['reloadKitchenScreen'] = [];
        }

        willPatch() {
            this.removeEvents()
        }

        patched() {
            this.removeEvents();
            this.initEvents()
        }

        mounted() {
            this.removeEvents();
            this.initEvents()
            this._tableLongpolling();
            this.tableLongpolling = setInterval(this._tableLongpolling.bind(this), 5000);
        }

        willUnmount() {
            this.removeEvents()
            this.initEvents()
            clearInterval(this.tableLongpolling);
            //no need remove events, we keep always listen events
        }

        _tableLongpolling() {
            try {
                this.rpc({
                    model: 'pos.config',
                    method: 'save_order_tickets',
                    args: [this.env.pos.config.id, this.state.orders],
                }, {shadow: true, timeout: 7500})
            } catch (error) {
                if (error.message.code < 0) {
                    console.error(error.message)
                } else {
                    throw error;
                }
            }
            this.env.pos.config.order_receipt_tickets = JSON.stringify(this.state.orders)
        }

        syncTransferSucceedReceipt(data) {
            this.state.orders = this.state.orders.filter(r => r.request_time != data.request_time)
            this.saveOrderReceipts()
        }

        get getCountReceipts() {
            if (this.env.pos) {
                return this.env.pos.db.getOrderReceipts().length;
            } else {
                return 0;
            }
        }

        clearSearch() {
            this._initializeSearchFieldConstants()
            this.filter = this.filterOptions[0];
            this.searchDetails = {};
            this.state.orders = this.sortOrder(this.env.pos.db.getOrderReceipts())
            this.render()
        }

        saveOrderReceipts() {
            this.state.orders = this.sortOrder(this.state.orders)
            this.env.pos.db.saveOrderReceipts(this.state.orders);
            this.clearSearch()
            this._tableLongpolling()
        }

        removeOrderEmptyItems(orderReceipt) {
            if (orderReceipt.new.length == 0 && orderReceipt.cancelled.length == 0) {
                this.env.pos.pos_bus.transfer_succeed_receipt(orderReceipt, 'Done', this.env.pos.user.name)
                this.state.orders = this.state.orders.filter(o => o.request_time != orderReceipt.request_time)
                this.saveOrderReceipts()
            }
        }

        sortOrder(orders) {
            // if kitchen: 1st is priority, 2st is low priority , 3st is normal ticket
            // if waiter: 1st is ticket done, 2st is priority , 3st is low priority
            if (this.env.pos.config.screen_type == 'kitchen') {
                orders = orders.filter(o => o.priority == true).concat(orders.filter(o => o.priority != true && o.state != 'Done')).concat(orders.filter(o => o.state == 'Done'))
            } else {
                orders = orders.filter(o => o.state == 'Done').concat(orders.filter(o => o.priority == true && o.state != 'Done')).concat(orders.filter(o => o.priority != true && o.state != 'Done'))
            }
            return orders
        }


        get orderList() {
            const filterCheck = (order) => {
                if (this.filter && this.filter !== 'All Receipts') {
                    const state = order.priority;
                    return this.filter === this.constants.stateSelectionFilter[state];
                }
                return true;
            };
            const filterTable = (order) => {
                if (this.filter && this.filter !== 'All Receipts') {
                    const table = order.table;
                    return this.filter === this.constants.stateSelectionFilter[table];
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
            const predicateTable = (order) => {
                return filterTable(order) && searchCheck(order);
            };
            let orders = this.state.orders.filter(predicate);
            orders = this.state.orders.filter(predicateTable);
            orders = this.sortOrder(orders)
            return orders
        }

        setSelectedOrder(event) {
            const selectedOrder = event.detail.order
            const self = this;
            this.state.selectedOrder = selectedOrder
            selectedOrder.new.forEach(n => { // start building qty need processing
                self.setSelectedLine({
                    detail: {
                        line: n,
                        order: null
                    }
                })
            })
            this.render()
        }

        newOrderReceiptsComing(receiptOrder) {
            this.env.pos.alert_message({
                title: this.env._t('Alert'),
                body: this.env._t('have 1 New Ticket')
            })
            receiptOrder.new.forEach(n => n.selected = undefined)
            receiptOrder.cancelled.forEach(c => c.selected = undefined)
            this.state.orders = this.state.orders.filter(r => r.request_time != receiptOrder.request_time)
            this.state.orders.push(receiptOrder);
            if (this.state.selectedOrder && this.state.selectedOrder.request_time == receiptOrder.request_time) {
                this.state.selectedOrder = receiptOrder
            }
            const ready_transfer_items = receiptOrder['ready_transfer_items']
            this.saveOrderReceipts()
            if (ready_transfer_items > 0) {
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Kitchen Processed Done Items !'),
                    body: receiptOrder['table'] + '/' + receiptOrder['floor'] + ' ' + receiptOrder['state'] + ' : ' + ready_transfer_items,
                    confirmText: this.env._t('Go Kitchen and Delivery Order'),
                    cancelText: this.env._t('Close')
                })
            }
        }

        reloadKitchenScreen() {
            this.clearSearch()
        }

        orderTransferTable(orderData) {
            const orderStored = this.state.orders.find(o => o.uid == orderData.uid)
            if (orderStored && this.env.pos.floors_by_id[orderData.floor_id] && this.env.pos.tables_by_id[orderData.table_id]) {
                var table = this.env.pos.tables_by_id[orderData.table_id];
                var floor = this.env.pos.floors_by_id[orderData.floor_id];
                if (table && floor) {
                    let lastTable = orderStored['floor'] + ' / ' + orderStored['table']
                    orderStored['floor'] = floor['name']
                    orderStored['table'] = table['name']
                    this.saveOrderReceipts()
                    this.showPopup('ConfirmPopup', {
                        title: this.env._t('Alert'),
                        body: lastTable + this.env._t(' moved to new Table: ') + orderStored['floor'] + ' / ' + orderStored['table'],
                        disableCancelButton: true,
                    })
                }
            }
        }

        orderReceiptRemoved(vals) {
            this.env.pos.alert_message({
                title: this.env._t('Alert'),
                body: this.env._t('have 1 Ticket Removed: ' + vals.uid)
            })
            if (this.env.pos.config.screen_type == 'kitchen') { // 1st: set state for kitchen know receipt has removed by waiters
                this.state.orders.forEach(r => {
                    if (r.uid == vals.uid) {
                        if (vals.action == 'unlink_order') {
                            r.state = 'Removed'
                        }
                        if (vals.action == 'paid_order') {
                            r.state = 'Paid'
                        }
                        r.userAction = vals.user
                        r.new.forEach(n => {
                            if (vals.action == 'unlink_order') {
                                n.state = 'Removed'
                            }
                            if (vals.action == 'paid_order') {
                                n.state = 'Paid'
                            }
                        })
                        r.cancelled.forEach(c => {
                            if (vals.action == 'unlink_order') {
                                c.state = 'Removed'
                            }
                            if (vals.action == 'paid_order') {
                                c.state = 'Paid'
                            }
                        })
                    }
                })
                this.env.pos.db.saveOrderReceipts(this.state.orders);
            } else { // 2st: remove receipt out of screen of waiters
                this.env.pos.db.removeOrderReceiptOutOfDatabase(vals.uid)
            }
            this.clearSearch()
        }

        setSelectedLine(event) {
            // todo: line [id] is product ID
            // let countTotalItemsSelected = 0;
            let qty_requested = 0
            let qty_cancelled = 0
            let {line, order} = event.detail;
            this.state.orders.forEach((o) => {
                o.new.forEach((n) => {
                    if (n.id == line.id && n.order_uid == line.order_uid) {
                        if (!n.selected) {
                            n.selected = true
                        } else {
                            n.selected = !n.selected
                        }
                        qty_requested += n.qty
                    } else {
                        n.selected = false
                    }
                })
                o.cancelled.forEach((n) => {
                    if (n.id == line.id && n.order_uid == line.order_uid) {
                        if (!n.selected) {
                            n.selected = true
                        } else {
                            n.selected = !n.selected
                        }
                        qty_requested -= n.qty
                        qty_cancelled += n.qty
                    } else {
                        n.selected = false
                    }
                })
            })
            this.state.orders.forEach((o) => {
                o.new.forEach((n) => {
                    if (n.id == line.id && n.order_uid == line.order_uid && n.selected && !['Done', 'Ready Transfer'].includes(n.state)) {
                        n.qty_requested = qty_requested
                        n.qty_cancelled = qty_cancelled
                    }
                })
            })
            this.render()
        }

        async transferItems(event) { // method for waiters/cashiers only
            const self = this;
            const orderReceipt = event.detail.order
            let setIsDone = false;
            orderReceipt.new.forEach(n => {
                if (n.state == 'Ready Transfer') {
                    n.state = 'Done'
                    setIsDone = true
                }
            })
            if (setIsDone) {
                this.env.pos.pos_bus.sync_receipt(orderReceipt)
            }
            const linesWaitingKitchen = orderReceipt.new.filter(n => ['New', 'Priority'].includes(n.state))
            if (linesWaitingKitchen.length == 0) {
                this.env.pos.pos_bus.transfer_succeed_receipt(orderReceipt, 'Done', this.env.pos.user.name)
                posbus.trigger('syncTransferSucceedReceipt', {
                    request_time: orderReceipt.request_time,
                    action: 'Done',
                    user: this.env.pos.user.name
                })
                this.state.selectedOrder = null;
                if (this.state.orders.length > 0) { // assign new ticket
                    let ordersIsDone = this.state.orders.filter(o => o.state == 'Done')
                    if (ordersIsDone.length > 0) {
                        this.state.selectedOrder = ordersIsDone[0]
                    }
                }
            }
            if (!setIsDone && linesWaitingKitchen.length > 0) {
                let {confirmed, payload} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert'),
                    body: this.env._t('Have ') + linesWaitingKitchen.length + this.env._t(' (items) waiting Kitchen Processing, are you want force it Done ?')
                })
                if (confirmed) {
                    linesWaitingKitchen.forEach(n => {
                        n.state = 'Done'
                        n.note = self.env.pos.user.name + this.env._t(' force state to Done')
                    })
                    this.env.pos.pos_bus.sync_receipt(orderReceipt)
                }
            }
            this.saveOrderReceipts()
        }

        doneLine(event) { // method for kitchen only, them done each line receipt
            let {line, order} = event.detail;
            if (!order.ready_transfer_items) {
                order.ready_transfer_items = 0
            }
            if (['New', 'Priority', 'Paid'].includes(line.state)) {
                line.state = 'Ready Transfer'
                order.ready_transfer_items += line.qty_requested
                order.state = 'Ready Transfer'
            }
            const reportHtml = QWeb.render('KitchenRequestItem', {
                pos: this.env.pos,
                change: line,
                order: order
            });
            this.showScreen('ReportScreen', {
                report_html: reportHtml,
                report_xml: null,
                orderRequest: order
            });
            this.removeAnotherLineTheSameOrderAndProduct(line)
            this.saveOrderReceipts()
            this.env.pos.pos_bus.sync_receipt(order)

        }

        async cancelLine(event) {
            let {line, order} = event.detail;
            if (this.env.pos.config.required_input_reason_cancel) {
                let {confirmed, payload: result} = await this.showPopup('PopUpSelectionBox', {
                    title: this.env._t('Why cancel this transaction ?'),
                    items: this.env.pos.cancel_reasons
                })
                if (confirmed) {
                    if (result.items.length) {
                        let cancelReasons = result.items.filter((i) => i.selected)
                        let cancelReasonsString = ""
                        for (let index in cancelReasons) {
                            if ((parseInt(index) + 1) < cancelReasons.length) {
                                cancelReasonsString += cancelReasons[index].name + ' , '
                            } else {
                                cancelReasonsString += cancelReasons[index].name
                            }
                        }
                        line.state = 'Kitchen Requesting Cancel'
                        // line.note = this.env.pos.user.name + this.env._t(' set Reason Cancel: ') + cancelReasonsString
                    } else {
                        return this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t('It not possible cancel transaction without select Reason')
                        })
                    }
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('It not possible cancel transaction without select Reason')
                    })
                }
            } else {
                // line.note = this.env.pos.user.name + this.env._t(' Requesting Cancel')
                line.state = 'Kitchen Requesting Cancel'
            }
            this.downQtyOfAnotherLineTheSameOrderAndProduct(line)
            this.saveOrderReceipts()
            this.env.pos.pos_bus.sync_receipt(order)
        }

        setPriority(event) {
            const orderReceipt = event.detail.order
            orderReceipt.new.forEach(n => {
                if (n.state == 'Priority') {
                    n.state = 'New'
                    return
                }
                if (n.state == 'New') {
                    n.state = 'Priority'
                    return
                }
            })
            const lineHasPriority = orderReceipt.new.find(n => n.state == 'Priority')
            if (lineHasPriority) {
                orderReceipt.priority = true
            }
            this.env.pos.pos_bus.sync_receipt(orderReceipt)
            this.saveOrderReceipts()
        }

        async forceDoneAllReceipts() {
            if (this.state.orders.length > 0) {
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('All Lines of all Orders displayed on your Screen will Force state to Done, are you sure to do it now ?')
                })
                if (confirmed) {
                    this.state.orders.forEach(o => {
                        this.actionOrderReceiptDone(o, 'Done')
                    })
                    this.state.selectedOrder = null;
                    this.render()
                }
                posbus.trigger('save-receipt')
            } else {
                this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your Kitchen Screen is blank')
                })
            }
        }

        pendingTickets() {
            this.clearSearch()
            this.state.orders = this.state.orders.filter(o => ['New', 'Pending'].includes(o.state))
            this.render()
        }

        get getPendingTickets() {
            return this.state.orders.filter(o => ['New', 'Pending'].includes(o.state)).length
        }

        takeAwayTickets() {
            this.clearSearch()
            this.state.orders = this.state.orders.filter(o => o.take_away_order)
            this.render()
        }

        get getTakeAwayTickets() {
            return this.state.orders.filter(o => o.take_away_order).length
        }

        actionOrderReceiptDone(order, state) {
            const self = this;
            order.new.forEach((l) => {
                l.state = state;
                if (['New', 'Priority'].includes(order.state)) {
                    l.note = self.env.pos.user.name + self.env._t(' set ') + state
                    l.state = state
                }
            })
            order.state = state
            order.finished_time = new Date().toISOString().split('T')[1].split('.')[0]
            if (this.env.pos.config.screen_type == 'kitchen') {
                this.env.pos.pos_bus.sync_receipt(order)
            } else {
                this.env.pos.pos_bus.transfer_succeed_receipt(order, state, this.env.pos.user.name)
            }
            this.env.pos.db.saveOrderReceipts(this.state.orders);
        }

        async printOrder(orderRequest) {
            const printers = this.env.pos.printers;
            if (!printers || printers.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('You pos not set Order Printers')
                })
            }
            let printerNetwork = printers.find((p) => p.printer_type == 'network')
            let printerViaPOSBOX = this.env.pos.config.proxy_ip && this.env.pos.config.iface_print_via_proxy
            if (!printerNetwork && !printerViaPOSBOX) { // todo: if pos not set proxy ip or printer network we return back odoo original
                this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Your POS Config not setup POSBOX or IOT Boxes')
                })
            } else {
                let epson_printer = null;
                for (var i = 0; i < printers.length; i++) {
                    var printer = printers[i];
                    if (orderRequest['new'].length > 0 || orderRequest['cancelled'].length > 0) {
                        var receipt = Qweb.render('OrderChangeReceipt', {changes: order, widget: this});
                        if (!printer.config.printer_id) {
                            printers[i].print(receipt);
                        } else {
                            var epson_printer_will_connect = this.env.pos.epson_priner_by_id[printer.config.printer_id[0]];
                            epson_printer = _.find(this.env.pos.epson_printers, function (epson_printer) {
                                return epson_printer['ip'] == epson_printer_will_connect['ip'] && epson_printer['state'] == 'Online'
                            });
                            if (epson_printer) {
                                this.env.pos.print_network(receipt, epson_printer['ip'])
                            }
                        }
                    }
                }
            }
            if (orderRequest['uid']) {
                const order = this.env.pos.get_order_by_uid(orderRequest['uid'])
                if (order) {
                    const fixture = document.createElement('div');
                    const orderReceipt = new (Registries.Component.get(OrderReceipt))(null, {order, orderRequest});
                    await orderReceipt.mount(fixture);
                    const receiptHtml = orderReceipt.el.outerHTML;
                    this.showScreen('ReportScreen', {
                        report_html: receiptHtml,
                        report_xml: null,
                    });
                    if (orderRequest['state'] == 'PAID') {
                        this.env.db.remove_order(order.id);
                        order.destroy({'reason': 'abandon'});
                    }
                    this.env.pos.alert_message({
                        title: this.env._t('Ticket Number'),
                        body: orderRequest['ticket_number'] + this.env._t(' Done !!!'),
                        timer: 5000,
                    })
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Order not found, it have remove or paid before')
                    })
                }
            }
        }

        deliveryAll(event) { // method for kitchen only
            // each line, find another receipt lines have the same product ID, line uid and state is Cancelled >> set it to Kitchen Confirmed Cancelled
            const self = this;
            const order = event.detail.order;
            if (!order.ready_transfer_items) {
                order.ready_transfer_items = 0
            }
            // 1st: REMOVE CANCELLED ITEMS OF ANOTHER TICKET we need remove all cancelled item another ticket the same table, for dont make kitchen confusing
            order.new.forEach(l => {
                order.ready_transfer_items += l.qty_requested
                self.removeAnotherLineTheSameOrderAndProduct(l)
            })
            // 2st: REDUCE QTY ITEMS OF ANOTHER TICKET
            order.cancelled.forEach(l => {
                self.downQtyOfAnotherLineTheSameOrderAndProduct(l)
            })

            if (['Paid', 'Removed'].includes(order.state)) {
                this.env.pos.pos_bus.transfer_succeed_receipt(order, 'Done', this.env.pos.user.name)
                this.state.orders = this.state.orders.filter(r => r.request_time != order.request_time)
            } else {
                this.actionOrderReceiptDone(order, 'Ready Transfer')
            }
            order.state = 'Done'
            this.state.orders = this.state.orders.filter(o => o.request_time != this.state.selectedOrder.request_time) // remove ticket out of screen
            this.saveOrderReceipts()
            this.state.selectedOrder = null;
            if (this.state.orders.length > 0) { // assign new ticket
                this.state.selectedOrder = this.state.orders[0]
            }
            this.printOrder(order)
        }

        removeAnotherLineTheSameOrderAndProduct(lineDelivery) {
            const self = this
            let ordersTheSameUid = self.state.orders.filter(o => o.uid == lineDelivery.order_uid && o.request_time != lineDelivery.request_time)
            if (ordersTheSameUid.length > 0) {
                ordersTheSameUid.forEach(o => {
                    o.cancelled = o.cancelled.filter(l => l.id != lineDelivery.id)
                    o.new = o.new.filter(l => l.id != lineDelivery.id)
                    self.removeOrderEmptyItems(o)
                })
            }
        }

        downQtyOfAnotherLineTheSameOrderAndProduct(lineDelivery) {
            const self = this
            let ordersTheSameUid = self.state.orders.filter(o => o.uid == lineDelivery.order_uid && o.request_time != lineDelivery.request_time)
            if (ordersTheSameUid.length > 0) {
                ordersTheSameUid.forEach(o => {
                    o.new.forEach(n => {
                        if (n.id == lineDelivery.id) {
                            n.qty -= lineDelivery.qty // down qty of another ticket lines
                            return true
                        }
                    })
                    self.removeOrderEmptyItems(o)
                })
            }
        }

        async clearScreen() {
            this.state.selectedOrder = null
            if (this.state.orders.length > 0) {
                this.env.pos.db.saveOrderReceipts([])
                this.clearSearch()
                posbus.trigger('save-receipt')
            } else {
                this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your Kitchen Screen is blank')
                })
            }
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
                Ticket: (order) => order.ticket_number,
                OrderRef: (order) => order.name,
                Floor: (order) => order.floor,
                Table: (order) => order.table,
                Waiter: (order) => order.user,
                Priority: (order) => order.priority,
            };
            return fields;
        }

        // TODO: define group filters
        get filterOptions() { // list state for filter
            let filterOptions = [
                'All Receipts',
                'Priority',
                'Low Priority',
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
                    true: 'Priority',
                    false: 'Low Priority',
                };
            } else {
                let selectionFilter = {
                    true: 'Priority',
                    false: 'Low Priority',
                };
                this.env.pos.tables.forEach(t => selectionFilter[t.name] = t.name)
                return selectionFilter
            }
        }

        _initializeSearchFieldConstants() {
            this.constants = {};
            Object.assign(this.constants, {
                searchFieldNames: Object.keys(this._searchFields),
                stateSelectionFilter: this._stateSelectionFilter,
            });
        }

        _onFilterSelected(event) {
            this.filter = event.detail.filter;
            this.render();
        }

        _onSearch(event) {
            const searchDetails = event.detail;
            Object.assign(this.searchDetails, searchDetails);
            this.render();
        }
    }

    KitchenScreen.template = 'KitchenScreen';

    Registries.Component.add(KitchenScreen);

    return KitchenScreen;
});
