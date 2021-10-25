odoo.define('pos_retail.SearchBar', function (require) {
    'use strict';

    const SearchBar = require('point_of_sale.SearchBar');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    const RetailSearchBar = (SearchBar) =>
        class extends SearchBar {
            constructor() {
                super(...arguments);
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('clear-search-bar', null, null);

            }

            mounted() {
                super.mounted()
                posbus.on('clear-search-bar', this, this.autoClearSearchBox);
            }

            _onBlur() {
                posbus.trigger('blur.search.products')
            }

            _onClick() {
                posbus.trigger('click.search.products')
            }

            autoClearSearchBox() {
                this.state.searchInput = ""
                this.trigger('update-search', "");
                this.render();
            }

            async clearInput() {
                await this.env.pos.syncProductsPartners();
                this.state.searchInput = ""
                this.trigger('update-search', "");
                this.render();
            }

            onKeyup(event) {
                if (this.env.pos.config.search_query_only_start_when_enter) { // TODO: when press to Enter only starting query product
                    if (event.code != 'Enter' && event.code != 'Backspace') {
                        return true
                    } else {
                        this.trigger('clear-search-product-filter')
                        this.trigger('update-search', event.target.value);
                    }
                }
                if (this.props.displayClearSearch && !['ArrowUp', 'ArrowDown', 'Enter'].includes(event.code)) { // only for products screen. When keyup event called here, trigger search input and filter products data from search box
                    this.trigger('clear-search-product-filter')
                    if (event.code != 'Escape') {
                        this.trigger('update-search', event.target.value);
                    } else {
                        this.trigger('update-search', "");
                        this.state.searchInput = ""
                    }
                }
                if (event.code == 'Escape') {
                    this.trigger('update-search', "");
                    this.state.searchInput = ""
                    event.target.value = ""
                }
                // TODO: automaticSearchOrder variable from xml of screens: invoice, sale order and pos order
                // It can help this seachbar know it from 3 screen and trigger event typing of user and send to any screen available
                if (this.props.automaticSearchOrder) {
                    this.trigger('event-keyup-search-order', event.target.value);
                } else {
                    if (event.code == 'Enter') {
                        this.trigger('try-add-product', { searchWordInput: this.state.searchInput });
                    }
                }
            }
        }
    Registries.Component.extend(SearchBar, RetailSearchBar);

    return RetailSearchBar;
});
