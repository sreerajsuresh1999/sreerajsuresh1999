odoo.define('pos_retail.SaleOrderList', function (require) {
    'use strict';

    const {debounce} = owl.utils;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const framework = require('web.framework');


    class SaleOrderList extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = {
                orders: this.env.pos.db.get_sale_orders() || [],
                query: null,
                selectedOrder: this.props.order,
                selectedClient: this.props.selectedClient,
                detailIsShown: false,
                isEditMode: false,
                editModeProps: {
                    order: null,
                    selectedClient: null
                },
            };
            this.updateOrderList = debounce(this.updateOrderList, 70);
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
            useListener('event-keyup-search-order', this._eventKeyupSearchOrder);
            this.searchDetails = {};
            this.filter = null;
            this._initializeSearchFieldConstants();
            this.orders = this.env.pos.db.get_sale_orders()
        }

        mounted() {
            super.mounted()
            this.getOrdersFromBackEnd()
        }

        willUnmount() {
            super.willUnmount()
        }

        async getOrdersFromBackEnd() {
            framework.blockUI()
            await this.env.pos.getSaleOrders()
            this.render()
            framework.unblockUI()
        }

        reloadSaleLines() {
            let reload_models = _.filter(this.env.pos.models, function (model) {
                return model.model == 'sale.order.line';
            });
            if (reload_models.length > 0) {
                this.env.pos.load_server_data_by_model(reload_models[0]);
            }
        }

        back() {
            if (this.state.detailIsShown) {
                this.state.detailIsShown = false;
                this.render();
            } else {
                this.props.resolve({confirmed: false, payload: false});
                this.trigger('close-temp-screen');
            }
        }

        confirm() {
            this.props.resolve({confirmed: true, payload: this.state.selectedOrder});
            this.trigger('close-temp-screen');
        }

        get currentOrder() {
            return this.env.pos.get_order();
        }

        get getOrders() {
            const filterCheck = (order) => {
                if (this.filter && this.filter !== 'All Items') {
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

        /**
         * Returns the text and command of the next button.
         * The command field is used by the clickNext call.
         */
        get nextButton() {
            if (!this.props.order) {
                return {command: 'set', text: 'Set Customer'};
            } else if (this.props.order && this.props.order === this.state.selectedOrder) {
                return {command: 'deselect', text: 'Deselect Customer'};
            } else {
                return {command: 'set', text: 'Change Customer'};
            }
        }

        // Methods

        // We declare this event handler as a debounce function in
        // order to lower its trigger rate.
        updateOrderList(event) {
            this.state.query = event.target.value;
            const clients = this.clients;
            if (event.code === 'Enter' && clients.length === 1) {
                this.state.selectedOrder = clients[0];
                this.clickNext();
            } else {
                this.render();
            }
        }

        clickOrder(event) {
            let order = event.detail.order;
            this.state.selectedOrder = order;
            this.state.editModeProps = {
                order: this.state.selectedOrder,
                selectedOrder: this.state.selectedOrder
            };
            this.state.detailIsShown = true;
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
            this.orders = this.env.pos.db.get_sale_orders()
            this.getOrdersFromBackEnd()
        }


        // TODO: ==================== Search bar example ====================

        get searchBarConfig() {
            return {
                searchFields: this.constants.searchFieldNames,
                filter: {show: true, options: this.filterOptions},
            };
        }

        // TODO: define search fields
        get _searchFields() {
            return {} // TODO: 15.07.2021 turnoff it, automatic search when cashier typing searchbox
            // var fields = {
            //     'Number or Name': (order) => order.name,
            //     'Customer': (order) => order.partner_id[1],
            //     'Reserved Mobile': (order) => order.reserve_mobile,
            //     'Notes': (order) => order.note,
            //     'Table': (order) => order.reserve_table_id[1],
            //     'Sale Person': (order) => order.user_id[1],
            //     'Date Order (MM/DD/YYYY)': (order) => moment(order.date_order).format('MM/DD/YYYY hh:mm A'),
            //
            //     ID: (order) => order.id,
            // };
            // return fields;
        }

        // TODO: define group filters
        get filterOptions() { // list state for filter
            return [
                'All Items',
                'Quotation/Reserved/Booking',
                'Quotation Sent',
                'Sale Order',
                'Looked',
                'Cancelled',
                'Booked',
            ];
        }

        get _stateSelectionFilter() {
            return {
                draft: 'Quotation/Reserved/Booking',
                sent: 'Quotation Sent',
                sale: 'Sale Order',
                done: 'Looked',
                cancel: 'Cancelled',
                booked: 'Booked',
            };
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
        _eventKeyupSearchOrder(event) {
            const searchInput = event.detail
            if (searchInput != "") {
                this.orders = this.env.pos.db.search_sale_orders(searchInput)
            } else {
                this.orders = this.env.pos.db.get_sale_orders()
            }
            this.render()
        }

        // TODO: return orders of system
        get orderList() {
            return this.orders
        }
    }

    SaleOrderList.template = 'SaleOrderList';

    Registries.Component.add(SaleOrderList);

    return SaleOrderList;
});
