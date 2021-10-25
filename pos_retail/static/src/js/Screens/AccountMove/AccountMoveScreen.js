odoo.define('pos_retail.AccountInvoiceList', function (require) {
    'use strict';

    const {debounce} = owl.utils;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const framework = require('web.framework');

    class AccountMoveScreen extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = {
                moves: this.env.pos.db.get_invoices(),
                query: null,
                selectedMove: this.props.move,
                detailIsShown: false,
                isEditMode: false,
                editModeProps: {
                    move: null
                },
            };
            this.updateOrderList = debounce(this.updateOrderList, 70);
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
            useListener('event-keyup-search-order', this._eventKeyupSearchOrder);
            this.searchDetails = {};
            this.filter = null;
            this._initializeSearchFieldConstants();
            this.moves = this.env.pos.db.get_invoices()
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
            await this.env.pos.getAccountMoves()
            this.render()
            framework.unblockUI()
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
            this.props.resolve({confirmed: true, payload: this.state.selectedMove});
            this.trigger('close-temp-screen');
        }

        get getMoves() {
            const filterCheck = (move) => {
                if (this.filter && this.filter !== 'All Items') {
                    const state = move.state;
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
            let moves = this.moveList.filter(predicate);
            return moves
        }

        get isNextButtonVisible() {
            return this.state.selectedMove ? true : false;
        }

        // Methods

        // We declare this event handler as a debounce function in
        // order to lower its trigger rate.
        updateOrderList(event) {
            this.state.query = event.target.value;
            // const clients = this.clients;
            // if (event.code === 'Enter' && clients.length === 1) {
            //     this.state.selectedMove = clients[0];
            //     this.clickNext();
            // } else {
            //     this.render();
            // }
        }

        clickMove(event) {
            let move = event.detail.move;
            this.state.selectedMove = move;
            this.state.editModeProps = {
                move: this.state.selectedMove,
            };
            this.state.detailIsShown = true;
            this.render();
        }

        clickNext() {
            this.state.selectedMove = this.nextButton.command === 'set' ? this.state.selectedMove : null;
            this.confirm();
        }

        clearSearch() {
            this._initializeSearchFieldConstants()
            this.filter = this.filterOptions[0];
            this.searchDetails = {};
            this.moves = this.env.pos.db.get_invoices()
            this.getOrdersFromBackEnd()
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
            return {} // TODO: 15.07.2021 turnoff it, automatic search when cashier typing searchbox
            // var fields = {
            //     'Number': (order) => order.name,
            //     Customer: (order) => order.partner_id[1],
            //     'Customer Reference': (order) => order.ref,
            //     'Payment Reference': (order) => order.payment_reference,
            //     'Sale Person': (order) => order.invoice_user_id[1],
            //     'Invoice Date (YYYY-MM-DD)': (order) => moment(order.invoice_date).format('YYYY-MM-DD hh:mm A'),
            //     'Invoice Due Date (YYYY-MM-DD)': (order) => moment(order.invoice_date_due).format('YYYY-MM-DD hh:mm A'),
            //     ID: (order) => order.id,
            // };
            // return fields;
        }

        // TODO: define group filters
        get filterOptions() { // list state for filter
            return [
                'All Items',
                'Draft',
                'Posted',
                'Cancelled',
            ];
        }

        get _stateSelectionFilter() {
            return {
                draft: 'Draft',
                posted: 'Posted',
                cancel: 'Cancelled',
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
                this.moves = this.env.pos.db.search_invoice(searchInput)
            } else {
                this.moves = this.env.pos.db.get_invoices()
            }
            this.render()
        }

        // TODO: return orders of system
        get moveList() {
            return this.moves
        }
    }

    AccountMoveScreen.template = 'AccountMoveScreen';

    Registries.Component.add(AccountMoveScreen);

    return AccountMoveScreen;
});
