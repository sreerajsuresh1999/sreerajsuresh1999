odoo.define('pos_retail.ProductCheckOut', function (require) {
    'use strict';
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const ControlButtonsMixin = require('point_of_sale.ControlButtonsMixin');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const {posbus} = require('point_of_sale.utils');

    class ProductCheckOut extends ControlButtonsMixin(PosComponent) {
        constructor() {
            super(...arguments);
            this._currentOrder = this.env.pos.get_order();
            if (this._currentOrder) {
                this._currentOrder.orderlines.on('change', this.render, this);
                this._currentOrder.orderlines.on('remove', this.render, this);
                this._currentOrder.orderlines.on('change', this._totalWillPaid, this);
                this._currentOrder.orderlines.on('remove', this._totalWillPaid, this);
                this._currentOrder.paymentlines.on('change', this._totalWillPaid, this);
                this._currentOrder.paymentlines.on('remove', this._totalWillPaid, this);
            }
            this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
            this.state = useState({
                total: 0,
                tax: 0,
                inputCustomer: '',
                countCustomers: 0,
                totalQuantities: 0,
                showButtons: this.env.pos.showAllButton
            });
            this._totalWillPaid()
            useListener('show-buttons', this._openAllButtons);
        }

        async UpdateTheme() {
            await this.showPopup('PopUpUpdateTheme', {
                title: this.env._t('Modifiers POS Theme'),
            })
        }

        async setProductsView() {
            if (this.env.pos.config.product_view == 'list') {
                this.env.pos.config.product_view = 'box'
            } else {
                this.env.pos.config.product_view = 'list'
            }
            await this.rpc({
                model: 'pos.config',
                method: 'write',
                args: [[this.env.pos.config.id], {
                    product_view: this.env.pos.config.product_view,
                }],
            })
            this.env.qweb.forceUpdate();
        }

        async setLimitedProductsDisplayed() {
            const {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                title: this.env._t('How many Products need Display on Products Screen'),
                startingValue: this.env.pos.db.limit,
            })
            if (confirmed) {
                if (number > 0) {
                    if (number > 1000) {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Warning'),
                            body: this.env._t('Maximum can set is 1000')
                        })
                    } else {
                        this.env.pos.db.limit = number
                        this.env.qweb.forceUpdate();
                    }
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Required number bigger than 0')
                    })
                }
            }
        }

        async addCategory() {
            let {confirmed, payload: results} = await this.showPopup('PopUpCreateCategory', {
                title: this.env._t('Create new Category')
            })
            if (confirmed && results['name']) {
                let value = {
                    name: results.name,
                    sequence: results.sequence
                }
                if (results.parent_id != 'null') {
                    value['parent_id'] = results['parent_id']
                }
                if (results.image_128) {
                    value['image_128'] = results.image_128.split(',')[1];
                }
                let category_id = await this.rpc({
                    model: 'pos.category',
                    method: 'create',
                    args: [value]
                })
                let newCategories = await this.rpc({
                    model: 'pos.category',
                    method: 'search_read',
                    args: [[['id', '=', category_id]]],
                })
                const pos_categ_model = this.env.pos.get_model('pos.category');
                if (pos_categ_model) {
                    pos_categ_model.loaded(this.env.pos, newCategories, {});
                }
                this.render()
                await this.reloadMasterData()
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Successfully'),
                    body: this.env._t('New POS Category just created, and append to your POS Category list'),
                    disableCancelButton: true,
                })
            } else {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Category Name is required')
                })
            }
        }

        async addProduct() {
            let {confirmed, payload: results} = await this.showPopup('PopUpCreateProduct', {
                title: this.env._t('Create new Product')
            })
            if (confirmed && results) {
                let value = {
                    name: results.name,
                    list_price: results.list_price,
                    default_code: results.default_code,
                    barcode: results.barcode,
                    standard_price: results.standard_price,
                    type: results.type,
                    available_in_pos: true
                }
                if (results.pos_categ_id != 'null') {
                    value['pos_categ_id'] = results['pos_categ_id']
                }
                if (results.product_brand_id != 'null') {
                    value['product_brand_id'] = parseInt(results['product_brand_id'])
                } else {
                    value['product_brand_id'] = null
                }
                if (results.image_1920) {
                    value['image_1920'] = results.image_1920.split(',')[1];
                }
                await this.rpc({
                    model: 'product.product',
                    method: 'create',
                    args: [value]
                })
                await this.reloadMasterData()
                this.env.pos.alert_message({
                    title: results.name,
                    body: this.env._t('Added to Products Screen now !!!'),
                    color: 'success'
                })
            }
        }

        get isActiveShowGuideKeyboard() {
            return this.env.isShowKeyBoard
        }

        async showKeyBoardGuide() {
            this.env.isShowKeyBoard = !this.env.isShowKeyBoard;
            this.env.qweb.forceUpdate();
            return this.showPopup('ConfirmPopup', {
                title: this.env._t('Tip !!!'),
                body: this.env._t('Press any key to Your Keyboard, POS Screen auto focus Your Mouse to Search Products Box. Type something to Search Box => Press to [Tab] and => Press to Arrow Left/Right for select a Product. => Press to Enter for add Product to Cart'),
                disableCancelButton: true,
            })
        }

        async getProductsTopSelling() {
            const {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                title: this.env._t('How many Products top Selling you need to show ?'),
                startingValue: 10,
            })
            if (confirmed) {
                const productsTopSelling = await this.rpc({
                    model: 'pos.order',
                    method: 'getTopSellingProduct',
                    args: [[], parseInt(number)],
                })
                let search_extends_results = []
                this.env.pos.productsTopSelling = {}
                if (productsTopSelling.length > 0) {
                    for (let index in productsTopSelling) {
                        let product_id = productsTopSelling[index][0]
                        let qty_sold = productsTopSelling[index][1]
                        this.env.pos.productsTopSelling[product_id] = qty_sold
                        let product = this.env.pos.db.get_product_by_id(product_id);
                        if (product) {
                            search_extends_results.push(product)
                        }
                    }
                }
                if (search_extends_results.length > 0) {
                    this.env.pos.set('search_extends_results', search_extends_results)
                    posbus.trigger('reload-products-screen')
                    posbus.trigger('remove-filter-attribute')
                }
            }
        }

        get blockScreen() {
            const selectedOrder = this.env.pos.get_order();
            if (!selectedOrder || !selectedOrder.is_return) {
                return false
            } else {
                return true
            }
        }

        async adNewCustomer() {
            let {confirmed, payload: results} = await this.showPopup('PopUpCreateCustomer', {
                title: this.env._t('Create New Customer'),
                mobile: ''
            })
            if (confirmed) {
                if (results.error) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: results.error
                    })
                }
                const partnerValue = {
                    'name': results.name,
                }
                if (results.image_1920) {
                    partnerValue['image_1920'] = results.image_1920.split(',')[1]
                }
                if (results.title) {
                    partnerValue['title'] = results.title
                }
                if (!results.title && this.env.pos.partner_titles) {
                    partnerValue['title'] = this.env.pos.partner_titles[0]['id']
                }
                if (results.street) {
                    partnerValue['street'] = results.street
                }
                if (results.city) {
                    partnerValue['city'] = results.city
                }
                if (results.street) {
                    partnerValue['street'] = results.street
                }
                if (results.phone) {
                    partnerValue['phone'] = results.phone
                }
                if (results.mobile) {
                    partnerValue['mobile'] = results.mobile
                }

                if (results.birthday_date) {
                    partnerValue['birthday_date'] = results.birthday_date
                }
                if (results.barcode) {
                    partnerValue['barcode'] = results.barcode
                }
                if (results.comment) {
                    partnerValue['comment'] = results.comment
                }
                if (results.property_product_pricelist) {
                    partnerValue['property_product_pricelist'] = results.property_product_pricelist
                } else {
                    partnerValue['property_product_pricelist'] = this.env.pos.pricelists[0].id
                }
                if (results.country_id) {
                    partnerValue['country_id'] = results.country_id
                }
                let partner_id = await this.rpc({
                    model: 'res.partner',
                    method: 'create',
                    args: [partnerValue],
                    context: {}
                })
                await this.reloadMasterData()
                const partner = this.env.pos.db.partner_by_id[partner_id]
                this.env.pos.get_order().set_client(partner)
            }
        }

        _openAllButtons() {
            this.env.pos.showAllButton = !this.env.pos.showAllButton
            this.state.showButtons = this.env.pos.showAllButton
        }

        get isCustomerSet() {
            if (this.env.pos.get_order() && this.env.pos.get_order().get_client()) {
                return true
            } else {
                return false
            }
        }

        async onKeydown(event) {
            const order = this.env.pos.get_order();
            if (event.key === 'Enter' && this.state.inputCustomer != '') {
                const partners = this.env.pos.db.search_partner(this.state.inputCustomer)
                this.state.countCustomers = partners.length
                if (partners.length > 1 && partners.length < 10) {
                    let list = []
                    for (let i = 0; i < partners.length; i++) {
                        let p = partners[i]
                        let pName = p.display_name
                        if (p.phone) {
                            pName += this.env._t(' , Phone: ') + p.phone
                        }
                        if (p.mobile) {
                            pName += this.env._t(' , Mobile: ') + p.mobile
                        }
                        if (p.email) {
                            pName += this.env._t(' , Email: ') + p.email
                        }
                        if (p.barcode) {
                            pName += this.env._t(' , Barcode: ') + p.barcode
                        }
                        list.push({
                            id: p.id,
                            label: pName,
                            isSelected: false,
                            item: p
                        })
                    }
                    let {confirmed, payload: client} = await this.showPopup('SelectionPopup', {
                        title: this.env._t('All Customers have Name or Phone/Mobile or Email or Barcode like Your Input: [ ' + this.state.inputCustomer + ' ]'),
                        list: list,
                        cancelText: this.env._t('Close')
                    })
                    if (confirmed) {
                        order.set_client(client);
                        this.state.countCustomers = 0
                        this.state.inputCustomer = ''
                    }
                } else if (partners.length > 10) {
                    this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('have many Customers with your type, please type correct [name, phone, or email] customer')
                    })
                } else if (partners.length == 1) {
                    order.set_client(partners[0]);
                    this.state.inputCustomer = ''
                    this.state.countCustomers = 0
                } else if (partners.length == 0) {
                    this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Sorry, We not Found any Customer with Your Yype')
                    })
                }
            } else {
                const partners = this.env.pos.db.search_partner(this.state.inputCustomer)
                this.state.countCustomers = partners.length
            }
        }

        _updateCurrentOrder(pos, newSelectedOrder) {
            this._currentOrder.orderlines.off('change', null, this);
            if (newSelectedOrder) {
                this._currentOrder = newSelectedOrder;
                this._currentOrder.orderlines.on('change', this.render, this);
            }
        }

        _totalWillPaid() {
            const total = this._currentOrder ? this._currentOrder.get_total_with_tax() : 0;
            const due = this._currentOrder ? this._currentOrder.get_due() : 0;
            const tax = this._currentOrder ? total - this._currentOrder.get_total_without_tax() : 0;
            this.state.total = total;
            this.state.tax = this.env.pos.format_currency(tax);
            let totalQuantities = 0
            if (this._currentOrder) {
                for (let i = 0; i < this._currentOrder.orderlines.models.length; i++) {
                    let line = this._currentOrder.orderlines.models[i]
                    totalQuantities += line.quantity
                }
            }
            this.state.totalQuantities = totalQuantities
            this.render();
        }

        mounted() {
            const self = this;
            super.mounted();
        }

        willUnmount() {
            super.willUnmount();
        }

        get client() {
            return this.env.pos.get_client();
        }

        get isLongName() {
            return this.client && this.client.name.length > 10;
        }

        get currentOrder() {
            return this.env.pos.get_order();
        }

        get invisiblePaidButton() {
            const selectedOrder = this._currentOrder;
            if (!selectedOrder || !this.env.pos.config.allow_payment || (selectedOrder && selectedOrder.get_orderlines().length == 0)) {
                return true
            } else {
                return false
            }
        }
    }

    ProductCheckOut.template = 'ProductCheckOut';

    Registries.Component.add(ProductCheckOut);

    return ProductCheckOut;
});
