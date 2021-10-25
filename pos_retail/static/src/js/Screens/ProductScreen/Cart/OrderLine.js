odoo.define('pos_retail.Orderline', function (require) {
    'use strict';

    const Orderline = require('point_of_sale.Orderline');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;
    const {posbus} = require('point_of_sale.utils');
    Orderline.template = 'RetailOrderline';
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks');

    const RetailOrderline = (Orderline) =>
        class extends Orderline {
            constructor() {
                super(...arguments);
                useListener('set-numpad-mode', this._setNumpadMode);
                // useListener('select-line', this._resetNumpadMode);
                this.state = useState({
                    showStockInformation: false,
                    screen: 'Products',
                    numpadMode: 'quantity'
                });
            }

            _resetNumpadMode() {
                NumberBuffer.capture();
                NumberBuffer.reset();
            }

            _setNumpadMode(event) {
                const {mode} = event.detail;
                NumberBuffer.capture();
                NumberBuffer.reset();
                this.state.numpadMode = mode;
            }

            mounted() {
                super.mounted();
                posbus.on('reset-screen', this, this._resetScreen);
                posbus.on('set-screen', this, this._setScreen);
                posbus.on('table-set', this, this._resetScreen);
                posbus.on('set-numpad-mode', this, this._setNumpadMode);
                this.props.line.product.get_price(this.env.pos._get_active_pricelist(), this.props.line.quantity, this.props.line.price_extra) // set pricelist items applied to this line
            }

            willUnmount() {
                super.willUnmount()
                posbus.off('closed-popup', this, null)
                posbus.off('reset-screen', this, null)
                posbus.off('set-screen', this, null)
                posbus.off('set-numpad-mode', this, null);
            }

            get addedClasses() {
                let parentValues = super.addedClasses;
                if (this.props.line.reward_id) {
                    parentValues['disabled-mode'] = true
                }
                return parentValues
            }

            _resetScreen() {
                this.state.screen = 'Products'
            }

            _setScreen(screenName) {
                this.state.screen = screenName
            }

            selectLine() {
                super.selectLine()
                if (this.props.line && this.env.pos.config.product_recommendation) {
                    this.props.line.order.getProductRecommendations(this.props.line.product)
                }
            }

            async removeLine() {
                this.props.line.order.remove_orderline(this.props.line)
                this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.props.line.product.name + this.env._t(' just removed out of Cart.')
                })
            }

            async OnChangeQty(event) {
                const newQty = event.target.value;
                if (this.env.pos.config.validate_quantity_change && ((this.env.pos.config.validate_quantity_change_type == 'increase' && this.props.line.quantity < parseFloat(newQty)) || (this.env.pos.config.validate_quantity_change_type == 'decrease' && this.props.line.quantity > parseFloat(newQty)) || this.env.pos.config.validate_quantity_change_type == 'both')) {
                    let validate = await this.env.pos._validate_action(this.env._t(' Need approved set new Quantity: ') + parseFloat(newQty));
                    if (!validate) {
                        event.target.value = this.props.line.quantity
                        return this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t('You have permission set Quantity, required request your Manager approve it.')
                        });
                    }
                }
                this.props.line.set_quantity(newQty)
            }

            async OnChangeDiscount(event) {
                const newDiscount = event.target.value;
                if (this.env.pos.config.validate_discount_change && ((this.env.pos.config.validate_discount_change_type == 'increase' && this.props.line.discount < parseFloat(newDiscount)) || (this.env.pos.config.validate_discount_change_type == 'decrease' && this.props.line.quantity > parseFloat(newDiscount)) || this.env.pos.config.validate_discount_change_type == 'both')) {
                    let validate = await this.env.pos._validate_action(this.env._t(' Need approved set new Discount: ') + parseFloat(newDiscount)) + ' ( % )';
                    if (!validate) {
                        event.target.value = this.props.line.discount
                        return this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t('You have permission set Discount, required request your Manager approve it.')
                        });
                    }
                }
                this.props.line.set_discount(newDiscount)
                this.render()
            }

            async OnChangePrice(event) {
                const newPrice = event.target.value;
                if (this.env.pos.config.validate_price_change && ((this.env.pos.config.validate_price_change_type == 'increase' && this.props.line.price < parseFloat(newPrice)) || (this.env.pos.config.validate_price_change_type == 'decrease' && this.props.line.price > parseFloat(newPrice)) || this.env.pos.config.validate_price_change_type == 'both')) {
                    let validate = await this.env.pos._validate_action(this.env._t(' Need approved set new Price: ') + parseFloat(newPrice));
                    if (!validate) {
                        event.target.value = this.props.line.price
                        return this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t('You have permission set Price, required request your Manager approve it.')
                        });
                    }
                }
                this.props.line.set_unit_price(newPrice)
                this.render()
            }

            OnChangeNote(event) {
                const newNote = event.target.value;
                this.props.line.set_line_note(newNote)
                this.render()
            }

            get getDiscountExtra() {
                return this.props.line.discount_extra
            }

            get getPriceExtra() {
                return this.props.line.price_extra
            }


            _onMouseEnter() {
                this.state.showStockInformation = true
            }

            _onMouseLeave() {
                this.state.showStockInformation = false
            }

            sendInput(input) {
                if (input == '+') {
                    this.props.line.set_quantity(this.props.line.quantity + 1)
                }
                if (input == '-') {
                    this.props.line.set_quantity(this.props.line.quantity - 1)
                }
                if (input == 'delete') {
                    this.props.line.order.remove_orderline(this.props.line);
                }
            }

            async setTags() {
                let selectedLine = this.props.line;
                if (!selectedLine) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Have not Selected Line')
                    })
                }
                let selectedTags = selectedLine.tags || [];
                let selectedTagsIds = selectedTags.map((t) => t.id)
                let tags = this.env.pos.tags;
                tags.forEach(function (t) {
                    if (selectedTagsIds.indexOf(t.id) != -1) {
                        t.selected = true
                    } else {
                        t.selected = false;
                    }
                    t.display_name = t.name;
                })
                let {confirmed, payload: results} = await this.showPopup('PopUpSelectionBox', {
                    title: this.env._t('Select Tags/Notes'),
                    items: tags
                })
                if (confirmed) {
                    let newTags = results.items.map((t) => t.id)
                    selectedLine.set_tags(newTags);
                }
            }

            async setNotes() {
                let selectedLine = this.props.line;
                if (!selectedLine) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Have not Selected Line')
                    })
                }
                const {confirmed, payload: inputNote} = await this.showPopup('TextAreaPopup', {
                    startingValue: selectedLine.get_note(),
                    title: this.env._t('Add Note'),
                });

                if (confirmed) {
                    selectedLine.set_note(inputNote);
                }
            }

            get getTotalAddonsItems() {
                if (this.props.line.addon_ids) {
                    return this.props.line.addon_ids.length
                } else {
                    return 0
                }
            }

            get countVariants() {
                let total_variants = this.env.pos.get_count_variant(this.props.line.product.product_tmpl_id)
                return total_variants.length
            }

            get allowChangeVariant() {
                let total_variants = this.env.pos.get_count_variant(this.props.line.product.product_tmpl_id)
                if (total_variants.length > 1) {
                    return true
                } else {
                    return false
                }
            }

            async changeVariant() {
                let self = this;
                let product = this.props.line.product
                let products = this.env.pos.db.total_variant_by_product_tmpl_id[product.product_tmpl_id]
                let attribute_ids = [];
                let attributes = [];
                for (var i = 0; i < products.length; i++) {
                    let productVariant = products[i];
                    if (productVariant.product_template_attribute_value_ids) {
                        for (var j = 0; j < productVariant.product_template_attribute_value_ids.length; j++) {
                            var attribute_id = productVariant.product_template_attribute_value_ids[j];
                            if (attribute_ids.indexOf(attribute_id) == -1) {
                                attribute_ids.push(attribute_id)
                                attributes.push(this.env.pos.attribute_value_by_id[attribute_id])
                            }
                        }
                    }
                }
                if (attributes.length && products.length) {
                    const {confirmed, payload} = await this.showPopup('PopUpSelectProductAttributes', {
                        title: this.env._t('Change Attributes and Values of : ') + this.props.line.product.display_name,
                        products: products,
                        attributes: attributes,
                    });
                    if (confirmed) {
                        let product_ids = payload.product_ids
                        if (product_ids.length) {
                            for (let index in product_ids) {
                                let product_id = product_ids[index]
                                let productAddToCart = self.env.pos.db.get_product_by_id(product_id);
                                this.env.pos.get_order().add_product(productAddToCart, {
                                    open_popup: true
                                })
                            }
                            this.env.pos.get_order().remove_orderline(this.props.line);
                        }
                    }
                }
            }

            async setAddons() {
                let productAddon = this.props.line.product.addon
                let selectedAddons = this.props.line.addon_ids
                if (!selectedAddons) {
                    this.props.line.addon_ids = []
                    selectedAddons = []
                }
                let addons = []
                for (let index in productAddon['product_ids']) {
                    let product = this.env.pos.db.get_product_by_id(productAddon['product_ids'][index]);
                    if (!product) {
                        continue
                    }
                    if (selectedAddons.includes(product.id)) {
                        product.selected = true
                    } else {
                        product.selected = false
                    }
                    addons.push(product)
                }
                if (addons.length) {
                    let {confirmed, payload: result} = await this.showPopup('PopUpSelectionBox', {
                        title: this.env._t('Select Add-ons Items'),
                        items: addons
                    })
                    if (confirmed) {
                        if (result.items.length) {
                            this.props.line.set_addons(result.items.map(a => a.id))
                        } else {
                            this.props.line.set_addons([])
                        }
                    }
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Products of Addon not available in POS')
                    })
                }
            }

            async showAllPriceEachPricelist() {
                this.props.line.set_price_by_pricelist()
                let priceEachPricelist = []
                for (let pricelist_id in this.props.line.price_by_pricelist) {
                    let pricelist = this.env.pos.pricelist_by_id[pricelist_id]
                    priceEachPricelist.push({
                        id: pricelist.id,
                        label: pricelist.name + this.env._t(' has Price: ') + this.env.pos.format_currency(this.props.line.price_by_pricelist[pricelist_id]),
                        item: pricelist,
                    })
                }
                if (priceEachPricelist.length != 0) {
                    let {confirmed, payload: pricelist} = await this.showPopup('SelectionPopup', {
                        title: this.env._t('Price of : ') + this.props.line.product.display_name,
                        list: priceEachPricelist,
                    })
                    if (confirmed) {
                        let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                            title: this.env._t('Pricelist will Change'),
                            body: this.env._t("Are you wanted change to Pricelist: ") + pricelist['name'],
                            confirmText: this.env._t('Yes'),
                            cancelText: this.env._t('No, keep current Pricelist')
                        })
                        if (confirmed) {
                            this.props.line.order.set_pricelist(pricelist)
                        }
                    }
                }
            }

            async showSuggestProduct() {
                const selectedOrder = this.env.pos.get_order();
                if (selectedOrder) {
                    selectedOrder.suggestItems()
                }
            }

            get getSuggestionNotActive() {
                if (this.props.line.product.cross_selling && this.env.pos.cross_items_by_product_tmpl_id != undefined && this.env.pos.cross_items_by_product_tmpl_id[this.props.line.product.product_tmpl_id]) {
                    return false
                } else {
                    return true
                }
            }

            async showBundlePackItems() {
                const selectedOrder = this.env.pos.get_order();
                if (selectedOrder) {
                    await selectedOrder.setBundlePackItems()
                    let selectedLine = selectedOrder.get_selected_orderline();
                    if (selectedLine.combo_items && selectedLine.combo_items.length != 0) {
                        await this.editBundlePackItems()
                    }
                }
            }

            async editBundlePackItems() {
                if (this.props.line.combo_items && this.props.line.combo_items.length) {
                    let {confirmed, payload: result} = await this.showPopup('ItemsQuantities', {
                        title: this.env._t('List Items of Combo/Bundle Pack: ') + this.props.line.product.display_name,
                        isSingleItem: false,
                        array: this.props.line.combo_items,
                    })
                    if (confirmed) {
                        const newStockArray = result.newArray
                        this.props.line.combo_items = newStockArray
                        this.props.line.trigger('change', this.props.line)
                        this.render()
                    }
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.props.line.product.display_name + this.env._t(' is not Combo/Bundle Pack, or Combo/Bundle Pack Items not set !!!')
                    })
                }
            }

            async modifiersComboItem(combo_item) {
                let lists = [
                    {
                        name: this.env._t('Full Size'),
                        item: 1,
                        id: 1,
                    },
                    {
                        name: this.env._t('Left and Right Haft'),
                        item: 2,
                        id: 2,
                    },
                    {
                        name: this.env._t('4 Quaters'),
                        item: 3,
                        id: 3,
                    },
                ]
                let title = this.env._t('Select type of Modifier')
                let {confirmed, payload: selectedCloseTypes} = await this.showPopup(
                    'PopUpSelectionBox',
                    {
                        title: title,
                        items: lists,
                        onlySelectOne: true,
                    }
                );
                let selectedType;
                if (selectedCloseTypes) {
                    selectedType = selectedCloseTypes['items'][0]
                }
                if (confirmed && selectedType) {
                    let arrays = []
                    if (selectedType.id == 1) {
                        arrays = [
                            {
                                name: this.env._t('Full Size'),
                                id: 1,
                            },
                        ]
                    }
                    if (selectedType.id == 2) {
                        arrays = [
                            {
                                name: this.env._t('Left Haft'),
                                id: 1,
                            },
                            {
                                name: this.env._t('Right Haft'),
                                id: 2,
                            }
                        ]
                    }
                    if (selectedType.id == 3) {
                        arrays = [
                            {
                                name: this.env._t('1st. Left Quater'),
                                id: 1,
                            },
                            {
                                name: this.env._t('2nd. Left Quater'),
                                id: 2,
                            },
                            {
                                name: this.env._t('3rd. Right Quater'),
                                id: 3,
                            },
                            {
                                name: this.env._t('4th. Right Quater'),
                                id: 4,
                            }
                        ]
                    }
                    let {confirmed, payload: modifiers} = await this.showPopup(
                        'PopUpModifierProductAttributes',
                        {
                            title: this.env._t('Please Fill Attribute Value to Selection Boxes'),
                            arrays: arrays,
                            datas: this.env.pos.product_attribute_values,
                        }
                    );
                    if (confirmed) {
                        combo_item['modifiers'] = modifiers
                        this.props.line.trigger('change', this.props.line)
                    }

                }
            }

            async modifiersPizza() {
                let lists = [
                    {
                        name: this.env._t('Full Size'),
                        item: 1,
                        id: 1,
                    },
                    {
                        name: this.env._t('Left and Right Haft'),
                        item: 2,
                        id: 2,
                    },
                    {
                        name: this.env._t('4 Quaters'),
                        item: 3,
                        id: 3,
                    },
                ]
                let title = this.env._t('Select type of Modifier')
                let {confirmed, payload: selectedCloseTypes} = await this.showPopup(
                    'PopUpSelectionBox',
                    {
                        title: title,
                        items: lists,
                        onlySelectOne: true,
                    }
                );
                let selectedType;
                if (selectedCloseTypes) {
                    selectedType = selectedCloseTypes['items'][0]
                }
                if (confirmed && selectedType) {
                    let arrays = []
                    if (selectedType.id == 1) {
                        arrays = [
                            {
                                name: this.env._t('Full Size'),
                                id: 1,
                            },
                        ]
                    }
                    if (selectedType.id == 2) {
                        arrays = [
                            {
                                name: this.env._t('Left Haft'),
                                id: 1,
                            },
                            {
                                name: this.env._t('Right Haft'),
                                id: 2,
                            }
                        ]
                    }
                    if (selectedType.id == 3) {
                        arrays = [
                            {
                                name: this.env._t('1st. Left Quater'),
                                id: 1,
                            },
                            {
                                name: this.env._t('2nd. Left Quater'),
                                id: 2,
                            },
                            {
                                name: this.env._t('3rd. Right Quater'),
                                id: 3,
                            },
                            {
                                name: this.env._t('4th. Right Quater'),
                                id: 4,
                            }
                        ]
                    }
                    let {confirmed, payload: modifiers} = await this.showPopup(
                        'PopUpModifierProductAttributes',
                        {
                            title: this.env._t('Please Fill Attribute Value to Selection Boxes'),
                            arrays: arrays,
                            datas: this.env.pos.product_attribute_values,
                        }
                    );
                    if (confirmed) {
                        this.props.line.modifiers = modifiers
                        this.props.line.trigger('change', this.props.line)
                    }

                }
            }

            get isBundlePackProduct() {
                let combo_items = this.env.pos.combo_items.filter((c) => this.props.line.product.product_tmpl_id == c.product_combo_id[0])
                if (combo_items.length) {
                    return true
                } else {
                    return false
                }
            }

            showProductPackaging() {
                let selectedOrder = this.env.pos.get_order();
                if (selectedOrder) {
                    selectedOrder.setProductPackaging()
                }
            }

            get hasProductPackaging() {
                if (this.props.line.product.sale_with_package && this.env.pos.packaging_by_product_id[this.props.line.product.id]) {
                    return true
                } else {
                    return false
                }
            }

            get hasMultiUnit() {
                if (this.props.line && this.env.pos.uoms_prices_by_product_tmpl_id && this.props.line.has_multi_unit()) {
                    return true
                } else {
                    return false
                }
            }

            async setUnit() {
                let uom_items = this.env.pos.uoms_prices_by_product_tmpl_id[this.props.line.product.product_tmpl_id];
                let list = uom_items.map((u) => ({
                    id: u.id,
                    label: u.uom_id[1],
                    item: u
                }));
                let {confirmed, payload: unit} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Select Unit of Measure for : ') + this.props.line.product.display_name,
                    list: list
                })
                if (confirmed) {
                    this.props.line.set_unit(unit.uom_id[0], unit.price)
                }
            }

            get hasMultiVariant() {
                if (this.props.line.product.multi_variant && this.env.pos.variant_by_product_tmpl_id && this.env.pos.variant_by_product_tmpl_id[this.props.line.product.product_tmpl_id]) {
                    return true
                } else {
                    return false
                }
            }

            setMultiVariant() {
                this.props.line.order.setMultiVariant()
            }

            get displaySetSeller() {
                if (this.env.pos.sellers && this.env.pos.sellers.length > 0) {
                    return true
                } else {
                    return false
                }
            }

            async setSeller() {
                const list = this.env.pos.sellers.map(seller => ({
                    id: seller.id,
                    label: seller.name,
                    isSelected: false,
                    item: seller,
                    imageUrl: 'data:image/png;base64, ' + seller['image_1920'],
                }))
                let {confirmed, payload: seller} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Please select one Seller'),
                    list: list
                })
                if (confirmed) {
                    this.props.line.set_sale_person(seller)
                }
            }

            async showAllLots() {
                const self = this;
                const orderline = this.props.line;
                const isAllowOnlyOneLot = orderline.product.isAllowOnlyOneLot();
                const packLotLinesToEdit = orderline.getPackLotLinesToEdit(isAllowOnlyOneLot);
                let allLotsOfLine = await this.rpc({
                    model: 'stock.production.lot',
                    method: 'search_read',
                    domain: [['product_id', '=', this.props.line.product.id]],
                    fields: []
                }).then(function (value) {
                    return value
                }, function (error) {
                    self.env.pos.query_backend_fail(error)
                    return false
                })
                if (!allLotsOfLine) {
                    allLotsOfLine = this.env.pos.lots.filter(l => l.product_id && l.product_id[0] == orderline.product['id'])
                }
                let lots = allLotsOfLine.map((l) => ({
                    id: l.id,
                    item: l,
                    label: l.name + this.env._t(' On Hand Available is: ') + l.product_qty + this.env._t(', and Expiration Date: ') + (l.expiration_date || 'N/A')
                }))
                let {confirmed, payload: selectedLot} = await this.showPopup(
                    'SelectionPopup',
                    {
                        title: this.env._t('Assign Lot/Serial for:  ') + orderline.product.display_name + this.env._t('. If you need Manual input, please click Cancel button'),
                        list: lots,
                        onlySelectOne: true,
                    }
                );
                if (confirmed && selectedLot) {
                    const modifiedPackLotLines = {}
                    const newPackLotLines = [{
                        lot_name: selectedLot.name
                    }]
                    orderline.setPackLotLines({modifiedPackLotLines, newPackLotLines});
                } else {
                    const {confirmed, payload} = await this.showPopup('EditListPopup', {
                        title: this.env._t('Lot/Serial Number(s) Required'),
                        isSingleItem: false,
                        array: packLotLinesToEdit,
                    });
                    if (confirmed) {
                        const newPackLotLines = payload.newArray
                            .filter(item => item.id)
                            .map(item => ({lot_name: item.name}));
                        const modifiedPackLotLines = payload.newArray
                            .filter(item => !item.id)
                            .map(item => ({lot_name: item.text}));
                        orderline.setPackLotLines({modifiedPackLotLines, newPackLotLines});
                    }
                }
            }

            async produceProduct() {
                const selectedLine = this.props.line;
                let order = selectedLine.order;
                if (selectedLine.is_has_bom().length == 0) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: order.selected_orderline.product.display_name + this.env._t(' have not Bill of Material'),
                    })
                }
                let bom_lines_set = selectedLine.get_bom_lines();
                if (bom_lines_set.length == 0) {
                    bom_lines_set = selectedLine.is_has_bom()[0].bom_line_ids;
                } else {
                    bom_lines_set = bom_lines_set.map((b_line) => {
                        b_line['bom_line']['quantity'] = b_line['quantity']
                        return b_line['bom_line']
                    })
                }
                let {confirmed, payload: results} = await this.showPopup('PopUpCreateMrpOrder', {
                    title: this.env._t('Modifiers BOM and Create MRP Order'),
                    items: bom_lines_set
                })
                if (confirmed) {
                    let bom_lines = results.items;
                    return selectedLine.set_bom_lines(bom_lines);
                }
            }

            // TODO: 23.07.2021 stop create MRP direct POS Screen
            // - If have set bom lines, auto trigger create picking from backend
            // async CreateMrpProduct(selectedLine, bom_lines_set) {
            //     var self = this;
            //     if (bom_lines_set) {
            //         let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
            //             title: this.env._t('How many items need Manufacturing Produce'),
            //             startingValue: selectedLine.quantity,
            //         })
            //         if (confirmed) {
            //             let mrpOrder = await this.rpc({
            //                 model: 'pos.order.line',
            //                 method: 'action_create_mrp_production_direct_from_pos',
            //                 args: [[],
            //                     this.env.pos.config.id,
            //                     selectedLine.order.name,
            //                     selectedLine.product.id,
            //                     parseFloat(number),
            //                     bom_lines_set
            //                 ],
            //                 context: {}
            //             }, {
            //                 shadow: true,
            //                 timeout: 60000
            //             }).then(function (mrp_production_value) {
            //                 return mrp_production_value
            //             }, function (err) {
            //                 return self.env.pos.query_backend_fail(err);
            //             })
            //             selectedLine.mrp_production_id = mrpOrder.id;
            //             selectedLine.mrp_production_state = mrpOrder.state;
            //             selectedLine.mrp_production_name = mrpOrder.name;
            //             selectedLine.trigger('change', selectedLine);
            //             var booking_link = window.location.origin + "/web#id=" + mrpOrder.id + "&view_type=form&model=mrp.production";
            //             window.open(booking_link, '_blank');
            //         }
            //     }
            // }

            async downloadGiftCards() {
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Downloading Gift Cards'),
                    body: this.env._t('Please Dont update or remove selected Line, Because we will remove this Gift Cards created before'),
                    disableCancelButton: true,
                })
                await this.env.pos.do_action('coupon.report_coupon_code', {
                    additional_context: {
                        active_ids: [this.props.line.coupon_ids],
                    }
                });
            }

            get isHasAttributes() {
                if (this.env.pos.config.product_configurator && _.some(this.props.line.product.attribute_line_ids, (id) => id in this.env.pos.attributes_by_ptal_id)) {
                    const attributes = _.map(this.props.line.product.attribute_line_ids, (id) => this.env.pos.attributes_by_ptal_id[id])
                        .filter((attr) => attr !== undefined);
                    if (attributes.length > 0) {
                        return true
                    } else {
                        return false
                    }
                } else {
                    return false
                }
            }

            async modifiersAttributes() {
                if (this.env.pos.config.product_configurator && _.some(this.props.line.product.attribute_line_ids, (id) => id in this.env.pos.attributes_by_ptal_id)) {
                    let attributes = _.map(this.props.line.product.attribute_line_ids, (id) => this.env.pos.attributes_by_ptal_id[id])
                        .filter((attr) => attr !== undefined);
                    let {confirmed, payload} = await this.showPopup('ProductConfiguratorPopup', {
                        product: this.props.line.product,
                        attributes: attributes,
                    });

                    if (confirmed) {
                        const description = payload.selected_attributes.join(', ');
                        const price_extra = payload.price_extra;
                        this.props.line['description'] = description
                        this.props.line['price_extra'] = price_extra
                        this.props.line.trigger('change', this.props.line)
                    } else {
                        return;
                    }
                }
            }

            get canBeUpdateStock() {
                if (this.env.pos.config.update_stock_onhand && this.props.line.product.type == 'product') {
                    return true
                } else {
                    return false
                }
            }

            async updateStockEachLocation() {
                this.state.showStockInformation = false;
                const product = this.props.line.product
                let stock_location_ids = this.env.pos.get_all_source_locations();
                let stock_datas = await this.env.pos.getStockDatasByLocationIds([product.id], stock_location_ids).then(function (datas) {
                    return datas
                });
                if (stock_datas) {
                    let items = [];
                    for (let location_id in stock_datas) {
                        let location = this.env.pos.stock_location_by_id[location_id];
                        if (location) {
                            items.push({
                                id: location.id,
                                name: location.display_name + this.env._t(' with Stock: ') + stock_datas[location_id][product.id],
                                item: location,
                                location_id: location.id,
                                quantity: stock_datas[location_id][product.id]
                            })
                        }
                    }
                    if (items.length) {
                        let {confirmed, payload: result} = await this.showPopup('UpdateStockOnHand', {
                            title: this.env._t('Summary Stock on Hand (Available Qty - Reserved Qty) each Stock Location of [ ') + product.display_name + ' ]',
                            isSingleItem: false,
                            array: items,
                        })
                        if (confirmed) {
                            const newStockArray = result.newArray
                            for (let i = 0; i < newStockArray.length; i++) {
                                let newStock = newStockArray[i];
                                await this.rpc({
                                    model: 'stock.location',
                                    method: 'pos_update_stock_on_hand_by_location_id',
                                    args: [newStock['location_id'], {
                                        product_id: product.id,
                                        product_tmpl_id: product.product_tmpl_id,
                                        quantity: parseFloat(newStock['quantity']),
                                        location_id: newStock['location_id']
                                    }],
                                    context: {}
                                }, {
                                    shadow: true,
                                    timeout: 65000
                                })
                                this.env.pos.trigger('reload.quantity.available')
                                this.env.pos.alert_message({
                                    title: product.display_name,
                                    body: this.env._t('Successfully update stock on hand'),
                                    color: 'success'
                                })

                            }
                            return this.updateStockEachLocation()
                        }
                    } else {
                        return this.env.pos.alert_message({
                            title: this.env._t('Warning'),
                            body: product.display_name + this.env._t(' not found stock on hand !!!')
                        })
                    }
                }
            }
        }


    Registries.Component.extend(Orderline, RetailOrderline);

    return RetailOrderline;
});
