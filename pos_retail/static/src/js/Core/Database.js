/*
    This module create by: thanhchatvn@gmail.com
    License: OPL-1
    Please do not modification if i not accept
    Thanks for understand
 */
odoo.define('pos_retail.database', function (require) {
    const db = require('point_of_sale.DB');
    const _super_db = db.prototype;
    const utils = require('web.utils');
    const round_pr = utils.round_precision;

    db.include({
        limit: 50
    });


    // db.include({
    //     limit: odoo.session_info.config.limited_products_display
    // });

    // We replace method of core odoo because
    // 1. odoo core looping products for store to database parameter
    //    - And if big products (few millions products) will made browse crash
    //    - And we need cache faster than, store values for quickly search

    _super_db.add_products = function (products) {
        // start custom
        products = this.get_data_by_company(window.posmodel, products);
        if (window.posmodel.config.limit_categories && window.posmodel.config.iface_available_categ_ids.length > 0) {
            products = products.filter(p => !p.pos_categ_id || (p.pos_categ_id && window.posmodel.config.iface_available_categ_ids.includes(p.pos_categ_id[0])))
        }
        // end custom
        // core odoo
        let stored_categories = this.product_by_category_id;

        if (!products instanceof Array) {
            products = [products];
        }
        for (let i = 0; i < products.length; i++) {
            let product = products[i];
            let string_product = utils.unaccent(this._product_search_string(product));
            let productSaveBefore = false;
            // add custom --------------//
            if (!this.product_ids.includes(product.id)) {
                this.product_ids.push(product.id)
            } else {
                productSaveBefore = true
            }
            // 1. save some new variables
            if (window.posmodel.session && window.posmodel.session.products_name && window.posmodel.session.products_name[product.id]) {
                product['display_name'] = window.posmodel.session.products_name[product.id]
                product['name'] = window.posmodel.session.products_name[product.id]
            }
            product.taxes_id = _.filter(product.taxes_id, function (tax_id) { // TODO: if have any tax id not loaded from account.tax of core odoo, we remove it
                return window.posmodel.taxes_by_id[tax_id] != undefined
            });
            if (product['uom_id']) { // save core uom id of product
                product['base_uom_id'] = product['uom_id'];
            }
            // 2. product multi category
            if (product.pos_categ_ids && product.pos_categ_ids.length) {
                let base_categ_id = product.pos_categ_id ? product.pos_categ_id[0] : this.root_category_id;
                for (let j = 0; j < product.pos_categ_ids.length; j++) {
                    let categ_id = product.pos_categ_ids[j];
                    if (!stored_categories[categ_id]) {
                        stored_categories[categ_id] = [];
                    }
                    // todo (product id is unit of stored_categories[categ_id])
                    if (!stored_categories[categ_id].includes(product.id) && categ_id != base_categ_id) { // custom: remove product out of stored_categories[categ_id]
                        stored_categories[categ_id].push(product.id);
                    }
                    if (this.category_search_string[categ_id] === undefined) {
                        this.category_search_string[categ_id] = '';
                    }
                    if (!productSaveBefore) {
                        this.category_search_string[categ_id] += string_product;
                    }
                }
            }
            // 3. add supplier barcode
            if (product['supplier_barcode']) {
                if (!this.product_by_supplier_barcode[product['supplier_barcode']]) {
                    this.product_by_supplier_barcode[product['supplier_barcode']] = [product];
                } else {
                    this.product_by_supplier_barcode[product['supplier_barcode']].push(product);
                }
            }
            // 4. save variants each product
            const product_tmpl_id = product.product_tmpl_id[0]
            if (!this.total_variant_by_product_tmpl_id[product_tmpl_id]) {
                this.total_variant_by_product_tmpl_id[product_tmpl_id] = [product]
            } else {
                this.total_variant_by_product_tmpl_id[product_tmpl_id] = _.filter(this.total_variant_by_product_tmpl_id[product_tmpl_id], function (p) {
                    return p.id != product.id
                })
                this.total_variant_by_product_tmpl_id[product_tmpl_id].push(product)
            }
            // end custom --------------//
            // custom ------------------//
            if (product.id in this.product_by_id) delete this.product_by_id[product.id]
            // -------------------------//

            if (product.available_in_pos) {
                let categ_id;
                if (window.posmodel.config.product_category_ids.length == 0) {
                    categ_id = product.pos_categ_id ? product.pos_categ_id[0] : this.root_category_id;
                } else {
                    categ_id = product.categ_id ? product.categ_id[0] : this.root_category_id;
                }
                product.product_tmpl_id = product.product_tmpl_id[0];
                if (!stored_categories[categ_id]) {
                    stored_categories[categ_id] = [];
                }
                // todo (product id is unique of stored_categories[categ_id])
                if (!stored_categories[categ_id].includes(product.id)) {
                    stored_categories[categ_id].push(product.id);
                }
                if (this.category_search_string[categ_id] === undefined) {
                    this.category_search_string[categ_id] = '';
                }
                if (!productSaveBefore) {
                    this.category_search_string[categ_id] += string_product;
                }
                if (this.root_category_id != categ_id) {
                    this.category_search_string[this.root_category_id] += string_product;
                }
                let ancestors = this.get_category_ancestors_ids(categ_id) || [];
                for (let j = 0, jlen = ancestors.length; j < jlen; j++) {
                    let ancestor = ancestors[j];
                    if (!stored_categories[ancestor]) {
                        stored_categories[ancestor] = [];
                    }
                    // todo (product id is unique of stored_categories[ancestor])
                    if (!stored_categories[ancestor].includes(product.id)) {
                        stored_categories[ancestor].push(product.id);
                    }
                    if (this.category_search_string[ancestor] === undefined) {
                        this.category_search_string[ancestor] = '';
                    }
                    if (!productSaveBefore) {
                        this.category_search_string[ancestor] += string_product;
                    }
                }
                if (product.addon_id && window.posmodel.addon_by_id && window.posmodel.addon_by_id[product.addon_id[0]]) {
                    product.addon = window.posmodel.addon_by_id[product.addon_id[0]]
                } else {
                    product.addon = null
                }
            }
            this.product_by_id[product.id] = product;
            if (product.barcode) {
                this.product_by_barcode[product.barcode] = product;
            }
            this.product_string_by_id[product.id] = string_product;
            // end core
        }
    }

    // _super_db.search_product_in_category = function (category_id, query) {
    //     try {
    //         query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g, '.');
    //         query = query.replace(/ /g, '.+');
    //         let re = RegExp("([0-9]+):.*?" + utils.unaccent(query), "gi");
    //     } catch (e) {
    //         return [];
    //     }
    //     let results = [];
    //     let product_ids = [];
    //     for (let i = 0; i < this.limit; i++) {
    //         let r = re.exec(this.category_search_string[category_id]);
    //         if (r) {
    //             let id = Number(r[1]);
    //             if (!product_ids.includes(id)) { // inside results: product is unique
    //                 product_ids.push(id)
    //                 results.push(this.get_product_by_id(id));
    //             }
    //
    //         } else {
    //             break;
    //         }
    //     }
    //     return results;
    // }

    // _super_db.search_partner = function (query) { // TODO: very slow (kimanh)
    //     console.log('[search_partner] with query: ' + query)
    //     try {
    //         query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g, '.');
    //         query = query.replace(/ /g, '.+');
    //         let re = RegExp("([0-9]+):.*?" + utils.unaccent(query), "gi");
    //     } catch (e) {
    //         return [];
    //     }
    //     let results = [];
    //     let partner_ids = [];
    //     for (let i = 0; i < this.limit; i++) {
    //         let r = re.exec(utils.unaccent(this.partner_search_string));
    //         if (r) {
    //             let id = Number(r[1]);
    //             if (this.get_partner_by_id(id) && !partner_ids.includes(id)) { // return unique partner
    //                 results.push(this.get_partner_by_id(id));
    //                 partner_ids.push(id)
    //             }
    //         } else {
    //             break;
    //         }
    //     }
    //     return results;
    // };

    _super_db.add_partners = function (partners) {
        // support multi company
        partners = this.get_data_by_company(window.posmodel, partners);
        let partnersNotActive = partners.filter(p => !p.active)
        if (partnersNotActive.length) {
            console.warn('Total ' + partnersNotActive.length + ' set active is False')
            console.warn(partnersNotActive)
        }
        partners = partners.filter(p => p.active)
        // end
        let updated_count = 0;
        let new_write_date = '';
        let partner;
        for (let i = 0, len = partners.length; i < len; i++) {
            partner = partners[i];
            // add custom
            if (window.posmodel.session && window.posmodel.session.partners_name && window.posmodel.session.partners_name[partner.id]) {
                partner['display_name'] = window.posmodel.session.partners_name[partner.id]
                partner['name'] = window.posmodel.session.partners_name[partner.id]
            }
            if (partner['birthday_date']) {
                partner['birthday_date'] = this._format_date(partner['birthday_date'])
            }
            if (partner.pos_loyalty_point) {
                partner.pos_loyalty_point = round_pr(partner.pos_loyalty_point, window.posmodel.currency.rounding);
            }
            if (partner.balance) {
                partner.balance = round_pr(partner.balance, window.posmodel.currency.rounding);
            }
            if (partner.deleted) { // when backend delete partner, we reset variant inside partner_string_by_id and partner_by_id
                delete this.partner_string_by_id[partner['id']];
                delete this.partner_by_id[partner['id']];
                continue;
            }
            if (partner.property_product_pricelist && window.posmodel.pricelist_by_id) { // re-update pricelist when pricelist change the same
                let pricelist = window.posmodel.pricelist_by_id[partner.property_product_pricelist[0]];
                if (pricelist) {
                    partner.property_product_pricelist = [pricelist.id, pricelist.display_name]
                }
            }
            if (partner.pos_loyalty_type) {
                partner.pos_loyalty_type_name = partner.pos_loyalty_type[1];
            }
            if (!partner['parent_id']) {
                this.partners_by_parent_id[partner.id] = []
            } else {
                if (!this.partners_by_parent_id[partner['parent_id'][0]]) {
                    this.partners_by_parent_id[partner['parent_id'][0]] = [partner]
                } else {
                    this.partners_by_parent_id[partner['parent_id'][0]].push(partner)
                }
            }
            // core odoo
            let local_partner_date = (this.partner_write_date || '').replace(/^(\d{4}-\d{2}-\d{2}) ((\d{2}:?){3})$/, '$1T$2Z');
            let dist_partner_date = (partner.write_date || '').replace(/^(\d{4}-\d{2}-\d{2}) ((\d{2}:?){3})$/, '$1T$2Z');
            if (this.partner_write_date &&
                this.partner_by_id[partner.id] &&
                new Date(local_partner_date).getTime() + 1000 >=
                new Date(dist_partner_date).getTime()) {
                // FIXME: The write_date is stored with milisec precision in the database
                // but the dates we get back are only precise to the second. This means when
                // you read partners modified strictly after time X, you get back partners that were
                // modified X - 1 sec ago.
                continue;
            } else if (new_write_date < partner.write_date) {
                new_write_date = partner.write_date;
            }
            if (!this.partner_by_id[partner.id]) {
                this.partner_sorted.push(partner.id);
            }
            this.partner_by_id[partner.id] = partner;
            updated_count += 1;
            // end core odoo
            if (!this.partner_ids.includes(partner.id)) {
                this.partner_ids.push(partner.id)
            }
        }

        this.partner_write_date = new_write_date || this.partner_write_date;

        if (updated_count) {
            // If there were updates, we need to completely
            // rebuild the search string and the barcode indexing
            // We remove 2 lines bellow because our module sync direct backend, we dont need reset variable
            // this.partner_search_string = "";
            // this.partner_by_barcode = {};

            for (let id in this.partner_by_id) {
                partner = this.partner_by_id[id];

                if (partner.barcode) {
                    this.partner_by_barcode[partner.barcode] = partner;
                }
                partner.address = (partner.street ? partner.street + ', ' : '') +
                    (partner.zip ? partner.zip + ', ' : '') +
                    (partner.city ? partner.city + ', ' : '') +
                    (partner.state_id ? partner.state_id[1] + ', ' : '') +
                    (partner.country_id ? partner.country_id[1] : '');
                let partner_string = this._partner_search_string(partner)
                if (!this.partner_string_by_id[partner.id]) {
                    this.partner_search_string += partner_string;
                }
                this.partner_string_by_id[partner.id] = partner_string;

            }

            this.partner_search_string = utils.unaccent(this.partner_search_string);
        }
        return updated_count;
    }

    _super_db._partner_search_string = function (partner) {
        let str = partner.display_name;
        if (partner.parent_id) {
            str += '|' + partner.parent_id[1];
        }
        if (partner.ref) {
            str += '|' + partner.ref;
        }
        if (partner.vat) {
            str += '|' + partner.vat;
        }
        if (partner.barcode) {
            str += '|' + partner.barcode;
        }
        // if (partner.address) { // TODO: make search partner very slow (kimanh)
        //     str += '|' + partner.address;
        // }
        if (partner.phone) {
            str += '|' + partner.phone.split(' ').join('');
        }
        if (partner.mobile) {
            str += '|' + partner.mobile.split(' ').join('');
        }
        if (partner.email) {
            str += '|' + partner.email;
        }
        str = '' + partner.id + ':' + str.replace(':', '').replace(/\n/g, ' ') + '\n';
        return str;
    };

    db.include({
        init: function (options) {
            this._super(options);
            this.product_by_supplier_barcode = {};
            this.products_stored = [];
            this.sequence = 1;
            // TODO: stored pos orders
            this.order_by_id = {};
            this.order_by_ean13 = {};
            this.order_search_string = "";
            this.order_search_string_by_id = {};
            this.order_by_partner_id = {}
            // TODO: stored account invoices
            this.invoice_ids = []
            this.invoice_by_id = {};
            this.invoice_by_partner_id = {};
            this.invoice_search_string = "";
            this.invoice_search_string_by_id = {};
            // TODO: auto complete search
            this.product_string_by_id = {};
            this.pos_order_string_by_id = {};
            this.invoice_string_by_id = {};
            this.sale_order_string_by_id = {};
            this.partner_string_by_id = {};
            // TODO: stored sale orders
            this.sale_order_by_id = {};
            this.sale_order_by_name = {};
            this.sale_search_string = '';
            this.sale_search_string_by_id = {};
            this.sale_order_by_ean13 = {};
            // TODO: last updated date by model
            this.write_date_by_model = {};
            // TODO: save unpaid orders and auto push to BackEnd for revert back Orders
            this.backup_orders = [];
            // Products Search Histories
            this.search_product_by_id = {};
            this.search_products_histories = [];
            this.generic_options = '';
            this.total_variant_by_product_tmpl_id = {};
            // TODO: saved partners and products display on POS
            this.product_ids = [];
            this.partner_ids = [];
            this.partners_by_parent_id = []
            this.category_search_string[0] = ""
        },
        _parse_generic_option_to_string: function (generic) {
            let str = generic.name;
            str = generic.id + ':' + str.replace(/:/g, '') + '\n';
            return str
        },
        // get_orders() {
        //     const orders = this._super();
        //     if (orders.length > 1) { // kimanh
        //         console.log('--> Many orders store on Browse, total is ' + orders.length)
        //         return [orders[0]] // todo: we not allow push many orders the same time to server, cahnge to one by one order
        //     }
        //     return orders
        // },
        save_generic_options: function (generic_options) {
            for (let i = 0; i < generic_options.length; i++) {
                let generic = generic_options[i];
                this.generic_options += this._parse_generic_option_to_string(generic)
            }
        },
        save: function (store, data) {
            try {
                this._super(store, data)
            } catch (e) {
                console.warn(e)
            }
            if (store == 'unpaid_orders' && window.posmodel && window.posmodel.config.backup_orders_automatic) {
                for (let i = 0; i < data.length; i++) {
                    let order = data[i];
                    this.backup_orders[order.id] = order;
                }
            }
        },
        get_data_by_company: function (pos, records) {
            this.company_id = pos.company.id;
            let self = this
            records = _.filter(records, function (record) {
                if (!record.company_id || (record.company_id && record.company_id[0] == self.company_id)) {
                    return true
                } else {
                    return false
                }
            })
            return records;
        },
        remove_order: function (order_id) {
            this._super(order_id);
            console.warn('Remove order ID:' + order_id)
        },
        getAllProducts(limited) {
            let products = []
            let count = 0
            for (let product_id in this.product_by_id) {
                products.push(this.product_by_id[product_id])
                count += 1
                if (limited && count >= limited) {
                    break
                }
            }
            console.log('[getAllProducts] total: ' + products.length)
            return products
        },

        getAllPartners() {
            let partners = []
            for (let partner_id in this.partner_by_id) {
                partners.push(this.partner_by_id[partner_id])
            }
            console.log('[getAllPartners] total: ' + partners.length)
            return partners
        },

        _product_search_string: function (product) { // TODO: supported search with name_second
            let str = product.display_name;
            if (product.id) {
                str += '|' + product.id;
            }
            if (product.barcode) {
                str += '|' + product.barcode;
            }
            if (product.supplier_code) {
                str += '|' + product.supplier_code;
            }
            if (product.default_code) {
                str += '|' + product.default_code;
            }
            if (product.description) {
                str += '|' + product.description;
            }
            if (product.description_sale) {
                str += '|' + product.description_sale;
            }
            if (product.name_second) {
                str += '|' + product.name_second;
            }
            if (product.special_name) {
                str += '|' + product.special_name;
            }
            if (product.product_brand_id) {
                str += '|' + product.product_brand_id[1];
            }
            if (product.categ_id) {
                str += '|' + product.categ_id[1];
            }
            if (product.pos_categ_id) {
                str += '|' + product.pos_categ_id[1];
            }
            if (product.plu_number) {
                str += '|' + product.plu_number;
            }
            let barcodes = window.posmodel.barcodes_by_product_id[product.id];
            if (barcodes && barcodes.length > 0) {
                barcodes.map((b) => {
                    str += '|';
                    str += b.barcode;
                })
            }
            let barcodesPackaging = window.posmodel.packaging_barcode_by_product_id[product.id];
            if (barcodesPackaging && barcodesPackaging.length > 0) {
                barcodesPackaging.map((b) => {
                    str += '|';
                    str += b.barcode;
                })
            }
            let lots = window.posmodel.lot_by_product_id[product.id];
            if (lots && lots.length > 0) {
                lots.map((l) => {
                    str += '|';
                    if (l.barcode) {
                        str += l.name;
                        str += '|';
                        str += l.barcode;
                    } else {
                        str += l.name;
                    }
                })
            }
            str = product.id + ':' + str.replace(/:/g, '') + '\n';
            product.search_extend = str;
            return str
        },
        set_last_write_date_by_model: function (model, results) {
            /* TODO:
                We need to know last records updated (change by backend clients)
                And use field write_date compare datas of pos and datas of backend
                We are get best of write date and compare
             */
            for (let i = 0; i < results.length; i++) {
                let line = results[i];
                if (line.deleted) {
                    continue
                }
                if (!this.write_date_by_model[model]) {
                    this.write_date_by_model[model] = line.write_date;
                    continue;
                }
                if (this.write_date_by_model[model] != line.write_date && new Date(this.write_date_by_model[model]).getTime() < new Date(line.write_date).getTime()) {
                    this.write_date_by_model[model] = line.write_date;
                }
            }
            console.log('LAST UPDATED DATE OF model: ' + model + ' is ' + this.write_date_by_model[model]);
        },
        filter_datas_notifications_with_current_date: function (model, datas) {
            let self = this;
            let new_datas = _.filter(datas, function (data) {
                return new Date(self.write_date_by_model[data['model']]).getTime() <= new Date(data['write_date']).getTime() + 1000;
            });
            return new_datas;
        },
        _format_date: function (old_date) {
            let parts = old_date.split('-');
            let new_date
            if (parts[0].length == 4) {
                new_date = old_date.toString().split("-").reverse().join("-");
            } else {
                new_date = old_date.toString().split("-").join("-");
            }
            return new_date;
        },
        get_product_by_id: function (id) {
            let product = this.product_by_id[id];
            if (!product) {
                return false;
            } else {
                return this._super(id)
            }
        },
        get_partners_sorted: function (max_count) {
            let partners = [];
            let max = 0;
            for (let partner_id in this.partner_by_id) {
                partners.push(this.partner_by_id[partner_id]);
                max += 1;
                if (max_count > 0 && max >= max_count) {
                    break;
                }
            }
            return partners;
        },
        get_products: function (max_count) {
            let products = [];
            let max = 0;
            for (let product_id in this.product_by_id) {
                products.push(this.product_by_id[product_id]);
                max += 1;
                if (max_count > 0 && max >= max_count) {
                    break;
                }
            }
            return products;
        },
        get_partner_string: function (partner) {
            let label = partner['display_name'];
            if (partner['ref']) {
                label += ', ' + partner['ref']
            }
            if (partner['barcode']) {
                label += ', ' + partner['barcode']
            }
            if (partner['email']) {
                label += ', ' + partner['email']
            }
            if (partner['phone']) {
                label += ', ' + partner['phone']
            }
            if (partner['mobile'] && (partner['mobile'] != partner['phone'])) {
                label += ', ' + partner['mobile']
            }
            return label
        },
        get_partners_source: function () {
            let source = [];
            for (let partner_id in this.partner_string_by_id) {
                let label = this.partner_string_by_id[partner_id];
                source.push({
                    value: partner_id,
                    label: label
                });
            }
            return source;
        },
        _parse_partners_for_autocomplete: function (partners) {
            let source = [];
            for (let i = 0; i < partners.length; i++) {
                let partner_id = partners[i].id;
                let label = this.partner_string_by_id[partner_id];
                source.push({
                    value: partner_id,
                    label: label
                });
            }
            return source;
        },
        get_products_source: function () {
            let source = [];
            for (let product_id in this.product_string_by_id) {
                let label = this.product_string_by_id[product_id];
                source.push({
                    value: product_id,
                    label: label
                })
            }
            return source;
        },

        _order_search_string: function (order) {
            let str = order.ean13;
            str += '|' + order.name;
            if (order.create_date) {
                str += '|' + order['create_date'];
            }
            if (order.pos_reference) {
                str += '|' + order['pos_reference'];
            }
            if (order.partner_id) {
                let partner = this.partner_by_id[order.partner_id[0]]
                if (partner) {
                    if (partner['name']) {
                        str += '|' + partner['name'];
                    }
                    if (partner.mobile) {
                        str += '|' + partner['mobile'];
                    }
                    if (partner.phone) {
                        str += '|' + partner['phone'];
                    }
                    if (partner.email) {
                        str += '|' + partner['email'];
                    }
                }
            }
            if (order.date_order) {
                str += '|' + order['date_order'];
            }
            if (order.note) {
                str += '|' + order['note'];
            }
            if (order.session_id) {
                str += '|' + order.session_id[1];
            }
            if (order.user_id) {
                str += '|' + order['user_id'][1];
            }
            str = '' + order['id'] + ':' + str.replace(':', '') + '\n';
            return str;
        },
        search_order: function (query) {
            query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g, '.');
            query = query.replace(' ', '.+');
            const re = RegExp("([0-9]+):.*?" + query, "gi");
            let results = [];
            let orderIds = []
            for (let i = 0; i < this.limit; i++) {
                let r = re.exec(this.order_search_string);
                if (r && r[1]) {
                    let id = r[1];
                    if (this.order_by_id[id] !== undefined && !orderIds.includes(id)) {
                        results.push(this.order_by_id[id]);
                        orderIds.push(id)
                    }
                } else {
                    break;
                }
            }
            return results;
        },
        get_pos_orders: function (max_count) {
            let orders = [];
            let max = 0;
            for (let order_id in this.order_by_id) {
                orders.push(this.order_by_id[order_id]);
                max += 1;
                if (max_count > 0 && max >= max_count) {
                    break;
                }
            }
            return orders;
        },
        get_pos_orders_source: function () {
            let source = [];
            for (let pos_order_id in this.pos_order_string_by_id) {
                let label = this.pos_order_string_by_id[pos_order_id];
                source.push({
                    value: pos_order_id,
                    label: label
                })
            }
            return source;
        },
        get_pos_order_string: function (order) {
            let label = order['name']; // auto complete
            if (order['ean13']) {
                label += ', ' + order['ean13']
            }
            if (order['pos_reference']) {
                label += ', ' + order['pos_reference']
            }
            if (order.partner_id) {
                let partner = this.get_partner_by_id(order.partner_id[0]);
                if (partner) {
                    label += ', ' + partner['name'];
                    if (partner['email']) {
                        label += ', ' + partner['email']
                    }
                    if (partner['phone']) {
                        label += ', ' + partner['phone']
                    }
                    if (partner['mobile']) {
                        label += ', ' + partner['mobile']
                    }
                }
            }
            return label
        },
        save_pos_orders: function (orders) {
            this.order_by_partner_id = {};
            let branch_id = window.posmodel.config.pos_branch_id;
            let pos_orders_filter_by_branch = window.posmodel.config.pos_orders_filter_by_branch;
            if (branch_id && pos_orders_filter_by_branch) {
                let branch_id = branch_id[0];
                orders = _.filter(orders, function (order) {
                    return order.pos_branch_id && order.pos_branch_id[0] == branch_id
                })
            }
            for (let i = 0; i < orders.length; i++) {
                let order = orders[i];
                order['lines'] = []
                order['payments'] = []
                if (order.partner_id) {
                    let partner;
                    if (order.partner_id && order.partner_id[0]) {
                        partner = this.get_partner_by_id(order.partner_id[0]);
                    } else {
                        partner = this.get_partner_by_id(order.partner_id);
                    }
                    if (partner) {
                        order.partner = partner;
                        order.partner_name = partner.name;
                    }
                }
                if (order.user_id) {
                    order['sale_person'] = order.user_id[1];
                } else {
                    order['sale_person'] = 'N/A';
                }
                if (order.session_id) {
                    order['session'] = order.session_id[1];
                } else {
                    order['sale_person'] = 'N/A';
                }
                this.order_by_id[order['id']] = order;
                this.order_by_ean13[order.ean13] = order;
                this.order_search_string_by_id[order.id] = this._order_search_string(order);
                this.pos_order_string_by_id[order['id']] = this.get_pos_order_string(order);
                if (order.partner_id) {
                    if (!this.order_by_partner_id[order.partner_id[0]]) {
                        this.order_by_partner_id[order.partner_id[0]] = [order]
                    } else {
                        this.order_by_partner_id[order.partner_id[0]].push(order)
                    }
                }
            }
            this.order_search_string = "";
            for (let order_id in this.order_search_string_by_id) {
                this.order_search_string += this.order_search_string_by_id[order_id];
            }
        },
        save_pos_order_line: function (lines) {
            let reload_pos_pack_operation_lot = false;
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                let order_id = line.order_id[0]
                let order = this.order_by_id[order_id]
                order['lines'].push(line)
                if (line.pack_lot_ids && line.pack_lot_ids.length) {
                    reload_pos_pack_operation_lot = true
                }
            }
            if (window.posmodel && reload_pos_pack_operation_lot) {
                window.posmodel.trigger('update:sync_pos_pack_operation_lot');
            }
        },
        _invoice_search_string: function (invoice) {
            let str = invoice.number;
            str += '|' + invoice.name;
            if (invoice.origin) {
                str += '|' + invoice.origin;
            }
            if (invoice.create_date) {
                str += '|' + invoice.create_date;
            }
            if (invoice.partner_id) {
                let partner = this.partner_by_id[invoice.partner_id[0]]
                if (partner) {
                    if (partner['name']) {
                        str += '|' + partner['name'];
                    }
                    if (partner.mobile) {
                        str += '|' + partner['mobile'];
                    }
                    if (partner.phone) {
                        str += '|' + partner['phone'];
                    }
                    if (partner.email) {
                        str += '|' + partner['email'];
                    }
                }
            }
            if (invoice.date_invoice) {
                str += '|' + invoice['date_invoice'];
            }
            str = '' + invoice['id'] + ':' + str.replace(':', '') + '\n';
            return str;
        },
        search_invoice: function (query) {
            query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g, '.');
            query = query.replace(' ', '.+');
            let re = RegExp("([0-9]+):.*?" + query, "gi");
            let results = [];
            let invoiceIds = []
            for (let i = 0; i < this.limit; i++) {
                let r = re.exec(this.invoice_search_string);
                if (r && r[1]) {
                    let id = r[1];
                    if (this.invoice_by_id[id] !== undefined && !invoiceIds.includes(id)) {
                        results.push(this.invoice_by_id[id]);
                        invoiceIds.push(id)
                    }
                } else {
                    break;
                }
            }
            return results;
        },
        get_invoices: function (max_count) {
            let invoices = [];
            let max = 0;
            for (let invoice_id in this.invoice_by_id) {
                invoices.push(this.invoice_by_id[invoice_id]);
                max += 1;
                if (max_count > 0 && max >= max_count) {
                    break;
                }

            }
            return invoices;
        },
        get_invoices_source: function () {
            let source = [];
            for (let invoice_id in this.invoice_string_by_id) {
                let label = this.invoice_string_by_id[invoice_id];
                source.push({
                    value: invoice_id,
                    label: label
                })
            }
            return source;
        },
        get_invoice_string: function (invoice) {
            let label = invoice['number'];
            let partner = this.get_partner_by_id(invoice.partner_id[0]);
            if (!partner) {
                return label;
            }
            if (invoice['origin']) {
                label += ', ' + invoice['origin'];
            }
            if (invoice['name']) {
                label += ', ' + invoice['name'];
            }
            if (partner['display_name']) {
                label += ', ' + partner['display_name']
            }
            if (partner['email']) {
                label += ', ' + partner['email']
            }
            if (partner['phone']) {
                label += ', ' + partner['phone']
            }
            if (partner['mobile']) {
                label += ', ' + partner['mobile']
            }
            return label
        },
        save_invoices: function (invoices) {
            for (let i = 0; i < invoices.length; i++) {
                let invoice = invoices[i];
                this.invoice_by_id[invoice.id] = invoice;
                if (!this.invoice_by_partner_id[invoice.partner_id[0]]) {
                    this.invoice_by_partner_id[invoice.partner_id[0]] = [invoice]
                } else {
                    this.invoice_by_partner_id[invoice.partner_id[0]] = this.invoice_by_partner_id[invoice.partner_id[0]].filter(i => i.id != invoice.id)
                    this.invoice_by_partner_id[invoice.partner_id[0]].push(invoice);
                }
                invoice['partner_name'] = invoice.partner_id[1];
                if (invoice.invoice_payment_term_id) {
                    invoice['payment_term'] = invoice.invoice_payment_term_id[1];
                } else {
                    invoice['payment_term'] = 'N/A';
                }
                if (invoice.invoice_user_id) {
                    invoice['user'] = invoice.invoice_user_id[1];
                } else {
                    invoice['user'] = 'N/A';
                }
                this.invoice_string_by_id[invoice['id']] = this.get_invoice_string(invoice);
                this.invoice_search_string_by_id[invoice['id']] = this._invoice_search_string(invoice);
                this.invoice_search_string += this.invoice_search_string_by_id[invoice.id];
                invoice['lines'] = []
                if (this.invoice_ids.indexOf(invoice.id) == -1) {
                    this.invoice_ids.push(invoice.id)
                }
            }
        },
        save_invoice_lines: function (moveLines) {
            for (let i = 0; i < moveLines.length; i++) {
                let moveLine = moveLines[i];
                let move_id = moveLine['move_id'][0]
                let move = this.invoice_by_id[move_id]
                move['lines'].push(moveLine)
            }
        },
        get_invoice_by_id: function (id) {
            return this.invoice_by_id[id];
        },

        _sale_order_search_string: function (sale) {
            let str = sale.name;
            if (sale.origin) {
                str += '|' + sale.origin;
            }
            if (sale.client_order_ref) {
                str += '|' + sale.client_order_ref;
            }
            if (sale.create_date) {
                str += '|' + sale.create_date;
            }
            if (sale.ean13) {
                str += '|' + sale.ean13;
            }
            if (sale.delivery_date) {
                str += '|' + sale.delivery_date;
            }
            if (sale.delivery_phone) {
                str += '|' + sale.delivery_phone;
            }
            if (sale.partner_shipping_id) {
                str += '|' + sale.partner_shipping_id[1];
            }
            if (sale.note) {
                str += '|' + sale.note;
            }
            if (sale.user_id) {
                str += '|' + sale.user_id[1];
            }
            if (sale.partner_id) {
                let partner = this.partner_by_id[sale.partner_id[0]]
                if (partner) {
                    if (partner['name']) {
                        str += '|' + partner['name'];
                    }
                    if (partner.mobile) {
                        str += '|' + partner['mobile'];
                    }
                    if (partner.phone) {
                        str += '|' + partner['phone'];
                    }
                    if (partner.email) {
                        str += '|' + partner['email'];
                    }
                }
            }
            str = '' + sale['id'] + ':' + str.replace(':', '') + '\n';
            return str;
        },
        search_sale_orders: function (query) {
            query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g, '.');
            query = query.replace(' ', '.+');
            const re = RegExp("([0-9]+):.*?" + query, "gi");
            let sale_orders = [];
            let saleIds = []
            for (let i = 0; i < this.limit; i++) {
                let r = re.exec(this.sale_search_string);
                if (r && r[1]) {
                    let id = r[1];
                    if (this.sale_order_by_id[id] !== undefined && !saleIds.includes(id)) {
                        sale_orders.push(this.sale_order_by_id[id]);
                        saleIds.push(id)
                    }
                } else {
                    break;
                }
            }
            return sale_orders;
        },
        get_sale_orders: function (max_count) {
            let orders = [];
            let max = 0;
            for (let sale_id in this.sale_order_by_id) {
                let sale = this.sale_order_by_id[sale_id];
                orders.push(sale);
                max += 1;
                if (max_count > 0 && max >= max_count) {
                    break;
                }

            }
            return orders;
        },
        get_sale_orders_source: function () {
            let source = [];
            for (let sale_id in this.sale_order_string_by_id) {
                let label = this.sale_order_string_by_id[sale_id];
                source.push({
                    value: sale_id,
                    label: label
                })
            }
            return source;
        },
        save_sale_orders: function (sale_orders) {
            for (let i = 0; i < sale_orders.length; i++) {
                let sale = sale_orders[i];
                if (sale.partner_id) {
                    let partner = this.get_partner_by_id(sale.partner_id[0]);
                    sale.partner = partner;
                }
                let label = this._sale_order_search_string(sale);
                this.sale_order_string_by_id[sale.id] = label;
                this.sale_order_by_id[sale.id] = sale;
                this.sale_order_by_name[sale.name] = sale;
                this.sale_search_string_by_id[sale.id] = label;
                if (sale.ean13) {
                    this.sale_order_by_ean13[sale.ean13] = sale
                }
                sale['lines'] = []
            }
            for (let sale_id in this.sale_search_string_by_id) {
                this.sale_search_string += this.sale_search_string_by_id[sale_id];
            }
        },
        save_sale_order_lines: function (lines) {
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                let sale_id = line.order_id[0];
                let order = this.sale_order_by_id[sale_id]
                if (order) {
                    order['lines'].push(line)
                }
            }
        },
        getOrderReceiptByUid(uid) {
            let orderReceipts = this.load('orderReceipts', []);
            return orderReceipts.filter(receipt => receipt.uid == uid)
        },
        removeOrderReceiptOutOfDatabase(uid) {
            let orderReceipts = this.load('orderReceipts', []);
            orderReceipts = orderReceipts.filter(r => r.uid != uid)
            this.save('orderReceipts', orderReceipts);

        },
        saveOrderReceipts: function (orders) {
            this.save('orderReceipts', orders);
        },
        getOrderReceipts: function () {
            let orderReceipts = this.load('orderReceipts', []);
            return orderReceipts
        },
        getKitchenTicketOrderNumber() {
            let RequestKitchenNumber = this.load('RequestKitchenNumber', 0);
            this.save('RequestKitchenNumber', RequestKitchenNumber + 1);
            return RequestKitchenNumber + 1
        },
        // todo: qrcode orders
        removeQrCodeOrder(uid) {
            let qrCodeOrders = this.load('qrCodeOrders', []);
            qrCodeOrders = qrCodeOrders.filter(o => o.uid != uid)
            this.save('qrCodeOrders', qrCodeOrders);
        },
        setStateQrCodeOrder(uid, state) {
            let qrCodeOrders = this.load('qrCodeOrders', []);
            let order = qrCodeOrders.find(o => o.uid == uid)
            if (order) {
                order.state = state
            }
            this.save('qrCodeOrders', qrCodeOrders);
        },
        getQrCodeOrderbyEan13(ean13) {
            let qrCodeOrders = this.load('qrCodeOrders', []);
            let order = qrCodeOrders.find(o => o.ean13 == ean13)
            return order

        },
        getQrCodeOrderbyUid(uid) {
            let qrCodeOrders = this.load('qrCodeOrders', []);
            let order = qrCodeOrders.find(o => o.uid == uid)
            return order

        },
        saveQrCodeOrder: function (orders) {
            let qrCodeOrders = this.load('qrCodeOrders', []);
            orders.forEach(o => qrCodeOrders = qrCodeOrders.filter(qrOrder => qrOrder.uid != o.uid))
            qrCodeOrders = qrCodeOrders.concat(orders)
            this.save('qrCodeOrders', qrCodeOrders);
        },
        getQrCodeOrders: function () {
            let qrCodeOrders = this.load('qrCodeOrders', []);
            return qrCodeOrders
        },
        removeQrCodeOrder(orderUidRemove) {
            let qrCodeOrders = this.load('qrCodeOrders', []);
            qrCodeOrders = qrCodeOrders.filter(qr => qr.uid != orderUidRemove)
            this.save('qrCodeOrders', qrCodeOrders);
        },
        removeAllQrCodeOrder() {
            this.save('qrCodeOrders', []);
        },
        removeAllQrCodeOrderHasDone() {
            let qrCodeOrders = this.load('qrCodeOrders', []);
            qrCodeOrders = qrCodeOrders.filter(qr => qr.state == 'Waiting')
            this.save('qrCodeOrders', qrCodeOrders);
        },

        saveFailReceipt(receiptData) {
            let networkReceipts = this.load('networkReceipts', []);
            networkReceipts.push(receiptData)
            this.save('networkReceipts', networkReceipts);
        },

        getFailReceiptsNetwork() {
            let networkReceipts = this.load('networkReceipts', []);
            return networkReceipts
        },
        resetFailReceiptsNetwork() {
            this.save('networkReceipts', []);
        }
    });
});
