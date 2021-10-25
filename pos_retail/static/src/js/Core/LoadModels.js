/*
    This module create by: thanhchatvn@gmail.com
 */
odoo.define('pos_retail.load_models', function (require) {
    const models = require('point_of_sale.models');
    const time = require('web.time');
    const exports = {};
    const Backbone = window.Backbone;
    const bus = require('pos_retail.core_bus');
    const core = require('web.core');
    const _t = core._t;
    const session = require('web.session');
    const rpc = require('web.rpc');
    const ERROR_DELAY = 30000;
    const hr = require('pos_hr.employees')
    const {posbus} = require('point_of_sale.utils');
    const BigData = require('pos_retail.big_data');


    exports.posSyncBackend = Backbone.Model.extend({
        initialize: function (pos) {
            this.pos = pos;
        },
        start: function () {
            this.bus = bus.bus;
            this.bus.last = this.pos.db.load('bus_last', 0);
            this.bus.on("notification", this, this.on_notification);
            this.bus.start_polling();
        },
        reload_pricelists: function () {
            console.log('{LoadModels} reload_pricelists')
            let self = this;
            let pricelists_model = _.filter(self.pos.models, function (model) {
                return model.pricelist;
            });
            if (pricelists_model) {
                let first_load = self.pos.load_server_data_by_model(pricelists_model[0]);
                self.pricelists_model = pricelists_model;
                return first_load.then(function () {
                    let second_load = self.pos.load_server_data_by_model(self.pricelists_model[1]);
                    return second_load.then(function () {
                        let order = self.pos.get_order();
                        let pricelist = self.pos._get_active_pricelist();
                        if (order && pricelist) {
                            order.set_pricelist(pricelist);
                        }
                    })
                })
            }
        },
        force_update_ui: function (config) {
            this.pos.session['config'] = config
            this.pos.chrome.env.qweb.forceUpdate();
        },
        async on_notification(notifications) {
            if (notifications && notifications[0] && notifications[0][1]) {
                for (let i = 0; i < notifications.length; i++) {
                    let channel = notifications[i][0][1];
                    if (channel == 'pos.sync.pricelists') {
                        this.reload_pricelists()
                    }
                    if (channel == 'pos.modifiers.background') {
                        this.force_update_ui(JSON.parse(notifications[i][1]))
                    }
                    if (channel == 'sync.backend') {
                        let datas = JSON.parse(notifications[i][1])
                        let model = datas['model']
                        let requestSync = null
                        const record_ids = datas['record_ids']
                        console.log('[New Notification Update from Backend] model: ' + model)
                        if (model == 'res.partner') {
                            const partnerObject = this.pos.get_model('res.partner');
                            let partnersSync = await this.pos.rpc({
                                model: 'res.partner',
                                method: 'search_read',
                                domain: [['id', 'in', record_ids]],
                                fields: partnerObject.fields
                            }, {
                                shadow: true,
                                timeout: 75000
                            })
                            if (partnersSync.length) {
                                this.pos.indexed_db.write('res.partner', partnersSync);
                                this.pos.save_results('res.partner', partnersSync);
                            }
                            for (let i = 0; i < record_ids.length; i++) {
                                let partner_id = record_ids[i]
                                let client = this.pos.db.get_partner_by_id(partner_id);
                                if (client) {
                                    posbus.trigger('sync.client', partner_id)
                                    this.pos.alert_message({
                                        title: _t('Customer: ') + client.name,
                                        body: _t('Update Successfully, modifiers at Backend !')
                                    })
                                } else {
                                    requestSync = true
                                }

                            }
                        }
                        if (model == 'product.product') {
                            const productObject = this.pos.get_model('product.product');
                            let productsMissed = await this.pos.rpc({
                                model: 'product.product',
                                method: 'search_read',
                                domain: [['id', 'in', record_ids], ['sale_ok', '=', true], ['available_in_pos', '=', true]],
                                fields: productObject.fields
                            }, {
                                shadow: true,
                                timeout: 75000
                            })
                            if (productsMissed.length) {
                                this.pos.indexed_db.write('product.product', productsMissed);
                                this.pos.save_results('product.product', productsMissed);
                            }
                            for (let i = 0; i < record_ids.length; i++) {
                                let product_id = record_ids[i]
                                let product = this.pos.db.get_product_by_id(product_id);
                                if (product) {
                                    posbus.trigger('reload.product.item', product_id)
                                    this.pos.alert_message({
                                        title: _t('Product: ') + product.name,
                                        body: _t('Update Successfully, modifiers at Backend !')
                                    })
                                } else {
                                    requestSync = true
                                }
                            }
                            // TODO: set products just update to top screen
                            this.pos.set('productsModifiers', record_ids)
                        }
                    }
                }
            }
        }
    });


    models.load_models([
        {
            model: 'product.addons',
            fields: ['name', 'product_ids', 'include_price_to_product'],
            loaded: function (self, addons) {
                self.addon_by_id = {};
                for (let i = 0; i < addons.length; i++) {
                    let addon = addons[i];
                    self.addon_by_id[addon.id] = addon
                }
            }
        },
        {
            model: 'product.college',
            fields: ['name', 'code'],
            loaded: function (self, colleges) {
                self.product_colleges = colleges;
            }
        },
        {
            model: 'product.model',
            fields: ['name', 'code'],
            loaded: function (self, models) {
                self.product_models = models;
            }
        },
        {
            model: 'product.sex',
            fields: ['name', 'code'],
            loaded: function (self, sexes) {
                self.product_sexes = sexes;
            }
        },
    ], {
        before: 'pos.config'
    });

    models.load_models([
        {
            model: 'pos.epson',
            fields: ['name', 'ip'],
            loaded: function (self, epson_printers) {
                self.epson_printer_default = null;
                self.epson_printers = [];
                self.epson_priner_by_id = {};
                self.epson_priner_by_ip = {};
                for (let i = 0; i < epson_printers.length; i++) {
                    self.epson_priner_by_id[epson_printers[i]['id']] = epson_printers[i];
                    self.epson_priner_by_ip[epson_printers[i]['ip']] = epson_printers[i];
                }
                // TODO: if pos have set printer_id, will use it for default print receipt
                let printer_id = self.config.printer_id;
                if (printer_id) {
                    let epson_printer_default = _.find(epson_printers, function (epson_printer) {
                        return epson_printer.id == printer_id[0];
                    });
                    if (epson_printer_default) {
                        epson_printer_default['print_receipt'] = true;
                        self.epson_printer_default = epson_printer_default;
                        self.epson_printers.push(epson_printer_default);
                    }
                }
            },
        },
        {
            model: 'pos.service.charge',
            fields: ['name', 'product_id', 'type', 'amount'],
            condition: function (self) {
                return self.config.service_charge_ids && self.config.service_charge_ids.length;
            },
            domain: function (self) {
                return [
                    ['id', 'in', self.config.service_charge_ids],
                ]
            },
            loaded: function (self, services_charge) {
                self.services_charge = services_charge;
                self.services_charge_ids = [];
                self.service_charge_by_id = {};
                for (let i = 0; i < services_charge.length; i++) {
                    let service = services_charge[i];
                    self.services_charge_ids.push(service.id);
                    self.service_charge_by_id[service.id] = service;
                }
            }
        },
        {
            model: 'res.bank',
            fields: ['name'],
            loaded: function (self, banks) {
                self.banks = banks;
                self.bank_by_id = {};
                for (let i = 0; i < banks.length; i++) {
                    let bank = banks[i];
                    self.bank_by_id[bank.id] = bank;
                }
            }
        },
        {
            model: 'res.lang',
            fields: ['name', 'code'],
            loaded: function (self, langs) {
                self.langs = langs
                self.lang_selected = langs.find(l => l.code == self.user.lang)
            }
        },
        {
            model: 'pos.promotion',
            fields: [
                'name',
                'start_date',
                'end_date',
                'type',
                'product_id',
                'discount_lowest_price',
                'product_ids',
                'minimum_items',
                'discount_first_order',
                'special_customer_ids',
                'promotion_birthday',
                'promotion_birthday_type',
                'promotion_group',
                'promotion_group_ids',
                'pos_branch_ids',
                'monday',
                'tuesday',
                'wednesday',
                'thursday',
                'friday',
                'saturday',
                'sunday',
                'from_time',
                'to_time',
                'special_days',
                'special_times',
                'method',
                'amount_total'
            ],
            domain: function (self) {
                let domains = [
                    ['state', '=', 'active'],
                    ['id', 'in', self.config.promotion_ids]
                ];
                return domains
            },
            promotion: true,
            loaded: function (self, promotions) {
                promotions = promotions.filter(p => {
                    if ((p['start_date'] <= (time.date_to_str(new Date()) + " " + time.time_to_str(new Date()))) && (p['end_date'] >= (time.date_to_str(new Date()) + " " + time.time_to_str(new Date())))) {
                        return true
                    } else {
                        return false
                    }
                })
                let promotion_applied = [];
                for (let i = 0; i < promotions.length; i++) {
                    let promotion = promotions[i];
                    if (self.config.pos_branch_id) {  // TODO case 1: if pos setting have set branch
                        if (!promotion.pos_branch_ids.length) {
                            promotion_applied.push(promotion);
                            continue
                        }
                        if (promotion.pos_branch_ids.indexOf(self.config.pos_branch_id[0]) != -1) {
                            promotion_applied.push(promotion);
                            continue
                        }
                    } else { // TODO case 2: if pos setting not set branch
                        if (promotion.pos_branch_ids.length == 0) {
                            promotion_applied.push(promotion);
                        }
                    }
                }
                self.promotions = promotion_applied;
                self.promotion_by_id = {};
                self.promotion_ids = [];
                let i = 0;
                while (i < promotions.length) {
                    self.promotion_by_id[promotions[i].id] = promotions[i];
                    self.promotion_ids.push(promotions[i].id);
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.discount.order',
            fields: ['minimum_amount', 'discount', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, discounts) {
                self.promotion_discount_order_by_id = {};
                self.promotion_discount_order_by_promotion_id = {};
                let i = 0;
                while (i < discounts.length) {
                    self.promotion_discount_order_by_id[discounts[i].id] = discounts[i];
                    if (!self.promotion_discount_order_by_promotion_id[discounts[i].promotion_id[0]]) {
                        self.promotion_discount_order_by_promotion_id[discounts[i].promotion_id[0]] = [discounts[i]]
                    } else {
                        self.promotion_discount_order_by_promotion_id[discounts[i].promotion_id[0]].push(discounts[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.discount.category',
            fields: ['category_id', 'discount', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, discounts_category) {
                self.promotion_by_category_id = {};
                let i = 0;
                while (i < discounts_category.length) {
                    self.promotion_by_category_id[discounts_category[i].category_id[0]] = discounts_category[i];
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.discount.quantity',
            fields: ['product_id', 'quantity', 'discount', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, discounts_quantity) {
                self.promotion_quantity_by_product_id = {};
                let i = 0;
                while (i < discounts_quantity.length) {
                    if (!self.promotion_quantity_by_product_id[discounts_quantity[i].product_id[0]]) {
                        self.promotion_quantity_by_product_id[discounts_quantity[i].product_id[0]] = [discounts_quantity[i]]
                    } else {
                        self.promotion_quantity_by_product_id[discounts_quantity[i].product_id[0]].push(discounts_quantity[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.gift.condition',
            fields: ['product_id', 'minimum_quantity', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, gift_conditions) {
                self.promotion_gift_condition_by_promotion_id = {};
                let i = 0;
                while (i < gift_conditions.length) {
                    if (!self.promotion_gift_condition_by_promotion_id[gift_conditions[i].promotion_id[0]]) {
                        self.promotion_gift_condition_by_promotion_id[gift_conditions[i].promotion_id[0]] = [gift_conditions[i]]
                    } else {
                        self.promotion_gift_condition_by_promotion_id[gift_conditions[i].promotion_id[0]].push(gift_conditions[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.gift.free',
            fields: ['product_id', 'quantity_free', 'promotion_id', 'type'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, gifts_free) {
                self.promotion_gift_free_by_promotion_id = {};
                let i = 0;
                while (i < gifts_free.length) {
                    if (!self.promotion_gift_free_by_promotion_id[gifts_free[i].promotion_id[0]]) {
                        self.promotion_gift_free_by_promotion_id[gifts_free[i].promotion_id[0]] = [gifts_free[i]]
                    } else {
                        self.promotion_gift_free_by_promotion_id[gifts_free[i].promotion_id[0]].push(gifts_free[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.discount.condition',
            fields: ['product_id', 'minimum_quantity', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, discount_conditions) {
                self.promotion_discount_condition_by_promotion_id = {};
                let i = 0;
                while (i < discount_conditions.length) {
                    if (!self.promotion_discount_condition_by_promotion_id[discount_conditions[i].promotion_id[0]]) {
                        self.promotion_discount_condition_by_promotion_id[discount_conditions[i].promotion_id[0]] = [discount_conditions[i]]
                    } else {
                        self.promotion_discount_condition_by_promotion_id[discount_conditions[i].promotion_id[0]].push(discount_conditions[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.discount.apply',
            fields: ['product_id', 'discount', 'promotion_id', 'type'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, discounts_apply) {
                self.promotion_discount_apply_by_promotion_id = {};
                let i = 0;
                while (i < discounts_apply.length) {
                    if (!self.promotion_discount_apply_by_promotion_id[discounts_apply[i].promotion_id[0]]) {
                        self.promotion_discount_apply_by_promotion_id[discounts_apply[i].promotion_id[0]] = [discounts_apply[i]]
                    } else {
                        self.promotion_discount_apply_by_promotion_id[discounts_apply[i].promotion_id[0]].push(discounts_apply[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.price',
            fields: ['product_id', 'minimum_quantity', 'price_down', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, prices) {
                self.promotion_price_by_promotion_id = {};
                let i = 0;
                while (i < prices.length) {
                    if (!self.promotion_price_by_promotion_id[prices[i].promotion_id[0]]) {
                        self.promotion_price_by_promotion_id[prices[i].promotion_id[0]] = [prices[i]]
                    } else {
                        self.promotion_price_by_promotion_id[prices[i].promotion_id[0]].push(prices[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.special.category',
            fields: ['category_id', 'type', 'count', 'discount', 'promotion_id', 'product_id', 'qty_free'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, promotion_lines) {
                self.promotion_special_category_by_promotion_id = {};
                let i = 0;
                while (i < promotion_lines.length) {
                    if (!self.promotion_special_category_by_promotion_id[promotion_lines[i].promotion_id[0]]) {
                        self.promotion_special_category_by_promotion_id[promotion_lines[i].promotion_id[0]] = [promotion_lines[i]]
                    } else {
                        self.promotion_special_category_by_promotion_id[promotion_lines[i].promotion_id[0]].push(promotion_lines[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.multi.buy',
            fields: ['promotion_id', 'product_ids', 'list_price', 'qty_apply'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, multi_buy) {
                self.multi_buy = multi_buy;
                self.multi_buy_by_promotion_id = {};
                for (let i = 0; i < multi_buy.length; i++) {
                    let rule = multi_buy[i];
                    if (!self.multi_buy_by_promotion_id[rule.promotion_id[0]]) {
                        self.multi_buy_by_promotion_id[rule.promotion_id[0]] = [rule]
                    } else {
                        self.multi_buy_by_promotion_id[rule.promotion_id[0]].push(rule);
                    }
                }
            }
        },
        {
            model: 'pos.loyalty',
            fields: ['name', 'product_loyalty_id', 'rounding', 'rounding_down'],
            condition: function (self) {
                return self.config.pos_loyalty_id;
            },
            domain: function (self) {
                return [
                    ['id', '=', self.config.pos_loyalty_id[0]],
                    ['state', '=', 'running'],
                ]
            },
            loaded: function (self, loyalties) {
                if (loyalties.length > 0) {
                    self.retail_loyalty = loyalties[0];
                    self.retail_loyalty['rewards'] = [] // todo: supported EE version if install pos_loyalty
                } else {
                    self.retail_loyalty = false;
                }
            }
        }, {
            model: 'pos.loyalty.rule',
            fields: [
                'name',
                'loyalty_id',
                'coefficient',
                'type',
                'product_ids',
                'category_ids',
                'min_amount'
            ],
            condition: function (self) {
                return self.retail_loyalty != undefined;
            },
            domain: function (self) {
                return [['loyalty_id', '=', self.retail_loyalty.id], ['state', '=', 'running']];
            },
            loaded: function (self, rules) {
                self.rules = rules;
                self.rule_ids = [];
                self.rule_by_id = {};
                self.rules_by_loyalty_id = {};
                for (let i = 0; i < rules.length; i++) {
                    self.rule_by_id[rules[i].id] = rules[i];
                    self.rule_ids.push(rules[i].id)
                    if (!self.rules_by_loyalty_id[rules[i].loyalty_id[0]]) {
                        self.rules_by_loyalty_id[rules[i].loyalty_id[0]] = [rules[i]];
                    } else {
                        self.rules_by_loyalty_id[rules[i].loyalty_id[0]].push(rules[i]);
                    }
                }
            }
        }, {
            model: 'pos.loyalty.reward',
            fields: [
                'name',
                'loyalty_id',
                'redeem_point',
                'type',
                'coefficient',
                'discount',
                'discount_product_ids',
                'discount_category_ids',
                'min_amount',
                'gift_product_ids',
                'resale_product_ids',
                'gift_quantity',
                'price_resale'
            ],
            condition: function (self) {
                return self.retail_loyalty;
            },
            domain: function (self) {
                return [['loyalty_id', '=', self.retail_loyalty.id], ['state', '=', 'running'], ['coefficient', '>', 0]]
            },
            loaded: function (self, rewards) {
                self.rewards = rewards;
                self.reward_by_id = {};
                self.rewards_by_loyalty_id = {};
                for (let i = 0; i < rewards.length; i++) {
                    self.reward_by_id[rewards[i].id] = rewards[i];
                    if (!self.rewards_by_loyalty_id[rewards[i].loyalty_id[0]]) {
                        self.rewards_by_loyalty_id[rewards[i].loyalty_id[0]] = [rewards[i]];
                    } else {
                        self.rewards_by_loyalty_id[rewards[i].loyalty_id[0]].push([rewards[i]]);
                    }
                }
            }
        },
        {
            label: 'Stock Picking Type',
            model: 'stock.picking.type',
            fields: ['name', 'code', 'default_location_dest_id', 'default_location_src_id', 'display_name', 'return_picking_type_id'],
            domain: function (self) {
                return ['|', ['id', '=', self.config.picking_type_id[0]], ['id', 'in', self.config.multi_stock_operation_type_ids]];
            },
            loaded: function (self, stock_picking_types) {
                self.default_location_src_of_picking_type_ids = [];
                self.stock_picking_type_by_id = {};
                for (let i = 0; i < stock_picking_types.length; i++) {
                    let picking_type = stock_picking_types[i];
                    if (picking_type.warehouse_id) {
                        picking_type['name'] = picking_type.warehouse_id[1] + ' / ' + picking_type['name']
                    }
                    self.stock_picking_type_by_id[picking_type['id']] = picking_type;
                    if (!self.default_location_src_of_picking_type_ids.includes() && picking_type.default_location_src_id) {
                        self.default_location_src_of_picking_type_ids.push(picking_type.default_location_src_id[0])
                    }
                }
                self.stock_picking_types = stock_picking_types;
            }
        },
        {
            model: 'stock.location',
            fields: ['name', 'location_id', 'company_id', 'usage', 'barcode', 'display_name'],
            domain: function (self) {
                return ['|', '|', ['id', 'in', self.config.stock_location_ids], ['id', '=', self.config.stock_location_id[0]], ['id', 'in', self.default_location_src_of_picking_type_ids]];
            },
            loaded: function (self, stock_locations) {
                self.stock_locations = stock_locations;
                self.stock_location_by_id = {};
                self.stock_location_ids = [];
                for (let i = 0; i < stock_locations.length; i++) {
                    let stock_location = stock_locations[i];
                    self.stock_location_by_id[stock_location['id']] = stock_location;
                    if (stock_location.usage == 'internal') {
                        self.stock_location_ids.push(stock_location['id'])
                    }
                }
            },
        },
        {
            label: 'Product Barcode',
            model: 'product.barcode',
            fields: ['product_tmpl_id', 'pricelist_id', 'uom_id', 'barcode', 'product_id'],
            domain: [],
            loaded: function (self, barcodes) {
                self.barcodes = barcodes;
                self.barcodes_by_barcode = {};
                self.barcodes_by_product_id = {};
                for (let i = 0; i < barcodes.length; i++) {
                    let barcode = barcodes[i];
                    if (!barcode['product_id']) {
                        continue
                    }
                    if (!self.barcodes_by_barcode[barcode['barcode']]) {
                        self.barcodes_by_barcode[barcode['barcode']] = [barcode];
                    } else {
                        self.barcodes_by_barcode[barcode['barcode']].push(barcode);
                    }
                    if (!self.barcodes_by_product_id[barcode['product_id'][0]]) {
                        self.barcodes_by_product_id[barcode['product_id'][0]] = [barcode];
                    } else {
                        self.barcodes_by_product_id[barcode['product_id'][0]].push(barcode);
                    }
                }
            }
        },
        {
            label: 'Product Barcode',
            model: 'pos.product.brand',
            fields: ['name', 'code', 'logo'],
            domain: [],
            loaded: function (self, brands) {
                self.productBrands = brands
                self.productByBrandId = {}
                for (let i = 0; i < brands.length; i++) {
                    self.productByBrandId[brands[i]['id']] = brands[i]
                }
                self.productByBrandId[0] = {
                    id: 0,
                    name: 'Brands'
                }
            }
        },
        {
            label: 'Packaging',
            model: 'product.packaging',
            fields: ['name', 'barcode', 'list_price', 'product_id', 'qty', 'sequence'],
            domain: function (self) {
                return [['active', '=', true]]
            },
            loaded: function (self, packagings) {
                self.packagings = packagings;
                self.packaging_by_product_id = {};
                self.packaging_by_id = {};
                self.packaging_barcode_by_product_id = {};
                for (let i = 0; i < packagings.length; i++) {
                    let packaging = packagings[i];
                    self.packaging_by_id[packaging.id] = packaging;
                    if (!self.packaging_by_product_id[packaging.product_id[0]]) {
                        self.packaging_by_product_id[packaging.product_id[0]] = [packaging]
                    } else {
                        self.packaging_by_product_id[packaging.product_id[0]].push(packaging)
                    }
                    if (!packaging.barcode) {
                        continue
                    }
                    if (!self.packaging_barcode_by_product_id[packaging.product_id[0]]) {
                        self.packaging_barcode_by_product_id[packaging.product_id[0]] = [packaging]
                    } else {
                        self.packaging_barcode_by_product_id[packaging.product_id[0]].push(packaging)
                    }
                }

            }
        },
    ], {
        after: 'pos.config'
    });

    let extend_models = [
        {
            label: 'Multi Currency',
            model: 'res.currency',
            fields: [],
            domain: function (self) {
                return ['|', ['id', 'in', self.pricelist_currency_ids], ['id', '=', self.currency.id]]
            },
            loaded: function (self, currencies) {
                self.currency_by_id = {};
                let i = 0;
                while (i < currencies.length) {
                    let currency = currencies[i];
                    currency['decimals'] = Math.ceil(Math.log(1.0 / currency.rounding) / Math.log(10));
                    self.currency_by_id[currencies[i].id] = currencies[i];
                    i++
                }
                self.currencies = currencies;
            }
        },
        {
            model: 'res.partner.group',
            fields: ['name', 'image', 'pricelist_applied', 'pricelist_id', 'height', 'width'],
            loaded: function (self, membership_groups) {
                self.membership_groups = membership_groups;
                self.membership_group_by_id = {};
                for (let i = 0; i < membership_groups.length; i++) {
                    let membership_group = membership_groups[i];
                    self.membership_group_by_id[membership_group.id] = membership_group;
                }
            },
            retail: true,
        },
        {
            label: 'Units of Measure',
            model: 'uom.uom',
            fields: [],
            domain: [],
            loaded: function (self, uoms) {
                self.uom_by_id = {};
                for (let i = 0; i < uoms.length; i++) {
                    let uom = uoms[i];
                    self.uom_by_id[uom.id] = uom;
                }
            }
        },
        {
            label: 'Sellers',
            model: 'res.users',
            fields: ['display_name', 'name', 'pos_security_pin', 'barcode', 'pos_config_id', 'partner_id', 'image_1920'],
            context: {sudo: true},
            loaded: function (self, users) {
                // TODO: have 2 case
                // TODO 1) If have set default_seller_id, default seller is default_seller_id
                // TODO 2) If have NOT set default_seller_id, default seller is pos_session.user_id
                self.users = users;
                self.user_by_id = {};
                self.user_by_pos_security_pin = {};
                self.user_by_barcode = {};
                self.default_seller = null;
                self.sellers = [];
                for (let i = 0; i < users.length; i++) {
                    let user = users[i];
                    if (user['pos_security_pin']) {
                        self.user_by_pos_security_pin[user['pos_security_pin']] = user;
                    }
                    if (user['barcode']) {
                        self.user_by_barcode[user['barcode']] = user;
                    }
                    self.user_by_id[user['id']] = user;
                    if (self.config.default_seller_id && self.config.default_seller_id[0] == user['id']) {
                        self.default_seller = user;
                    }
                    if (self.config.seller_ids.indexOf(user['id']) != -1) {
                        self.sellers.push(user)
                    }
                }
                if (!self.default_seller) { // TODO: if have not POS Config / default_seller_id: we set default_seller is user of pos session
                    let pos_session_user_id = self.pos_session.user_id[0];
                    if (self.user_by_id[pos_session_user_id]) {
                        self.default_seller = self.user_by_id[pos_session_user_id]
                    }
                }
            }
        },
        {
            model: 'pos.tag',
            fields: ['name', 'is_return_reason', 'color'],
            domain: [],
            loaded: function (self, tags) {
                self.tags = tags;
                self.tag_by_id = {};
                self.cancel_reasons = []
                self.return_reasons = [];
                let i = 0;
                while (i < tags.length) {
                    let tag = tags[i];
                    self.tag_by_id[tag.id] = tag;
                    if (tag.is_return_reason) {
                        self.return_reasons.push(tag)
                    }
                    if (self.config.reason_cancel_reason_ids.indexOf(tag.id) != -1) {
                        self.cancel_reasons.push(tag)
                    }
                    i++;
                }

            }
        }, {
            model: 'pos.note',
            fields: ['name'],
            loaded: function (self, notes) {
                self.notes = notes;
                self.note_by_id = {};
                let i = 0;
                while (i < notes.length) {
                    self.note_by_id[notes[i].id] = notes[i];
                    i++;
                }
            }
        }, {
            model: 'pos.combo.item',
            fields: ['product_id', 'product_combo_id', 'default', 'quantity', 'uom_id', 'tracking', 'required', 'price_extra'],
            domain: [],
            loaded: function (self, combo_items) {
                self.combo_items = combo_items;
                self.combo_item_by_id = {};
                for (let i = 0; i < combo_items.length; i++) {
                    let item = combo_items[i];
                    self.combo_item_by_id[item.id] = item;
                }
            }
        }, {
            model: 'product.generic.option',
            fields: ['product_ids', 'name', 'price_extra'],
            condition: function (self) {
                return self.config.product_generic_option;
            },
            domain: [],
            loaded: function (self, generic_options) {
                self.generic_options = generic_options;
                self.generic_option_by_id = {};
                for (let i = 0; i < generic_options.length; i++) {
                    let generic_option = generic_options[i];
                    self.generic_option_by_id[generic_option.id] = generic_option;
                }
                self.db.save_generic_options(generic_options);
            }
        },
        {
            label: 'Global Discount',
            model: 'pos.global.discount',
            fields: ['name', 'amount', 'product_id', 'reason', 'type', 'branch_ids'],
            domain: function (self) {
                return [['id', 'in', self.config.discount_ids]];
            },
            condition: function (self) {
                return self.config.discount && self.config.discount_ids.length > 0;
            },
            loaded: function (self, discounts) {
                discounts = _.filter(discounts, function (discount) {
                    return discount.branch_ids.length == 0 || (self.config.pos_branch_id && discount.branch_ids && discount.branch_ids.indexOf(self.config.pos_branch_id[0]) != -1)
                });
                self.discounts = discounts;
                self.discount_by_id = {};
                let i = 0;
                while (i < discounts.length) {
                    self.discount_by_id[discounts[i].id] = discounts[i];
                    i++;
                }
            }
        },
        {
            label: 'Price by Unit',
            model: 'product.uom.price',
            fields: [],
            domain: [],
            loaded: function (self, uoms_prices) {
                self.uom_price_by_uom_id = {};
                self.uoms_prices_by_product_tmpl_id = {};
                self.uoms_prices = uoms_prices;
                for (let i = 0; i < uoms_prices.length; i++) {
                    let item = uoms_prices[i];
                    if (item.product_tmpl_id) {
                        self.uom_price_by_uom_id[item.uom_id[0]] = item;
                        if (!self.uoms_prices_by_product_tmpl_id[item.product_tmpl_id[0]]) {
                            self.uoms_prices_by_product_tmpl_id[item.product_tmpl_id[0]] = [item]
                        } else {
                            self.uoms_prices_by_product_tmpl_id[item.product_tmpl_id[0]].push(item)
                        }
                    }
                }
            }
        },
        {
            label: 'Product Variants',
            model: 'product.variant',
            fields: ['product_tmpl_id', 'attribute_id', 'value_id', 'price_extra', 'product_id', 'quantity', 'uom_id'],
            domain: function (self) {
                return [['active', '=', true]];
            },
            loaded: function (self, variants) {
                self.variants = variants;
                self.variant_by_product_tmpl_id = {};
                self.variant_by_id = {};
                for (let i = 0; i < variants.length; i++) {
                    let variant = variants[i];
                    variant.display_name = variant.attribute_id[1] + ' / ' + variant.value_id[1];
                    self.variant_by_id[variant.id] = variant;
                    if (!self.variant_by_product_tmpl_id[variant['product_tmpl_id'][0]]) {
                        self.variant_by_product_tmpl_id[variant['product_tmpl_id'][0]] = [variant]
                    } else {
                        self.variant_by_product_tmpl_id[variant['product_tmpl_id'][0]].push(variant)
                    }
                }
            }
        },
        {
            label: 'Product Attributes',
            model: 'product.attribute',
            fields: ['name', 'multi_choice', 'product_tmpl_ids'],
            domain: function (self) {
                return [];
            },
            loaded: function (self, attributes) {
                self.product_attributes = attributes;
                self.product_attribute_by_id = {};
                for (let i = 0; i < attributes.length; i++) {
                    let attribute = attributes[i];
                    self.product_attribute_by_id[attribute.id] = attribute;
                }
            }
        },
        {
            label: 'Product Attributes',
            model: 'product.attribute.value',
            fields: ['name', 'attribute_id', 'sequence'],
            domain: function (self) {
                return [];
            },
            loaded: function (self, attribute_values) {
                self.product_attribute_values = attribute_values;
                self.product_attribute_value_by_id = {};
                self.product_attribute_value_by_attribute_id = {};
                for (let i = 0; i < attribute_values.length; i++) {
                    let attribute_value = attribute_values[i];
                    attribute_value['name'] = attribute_value['attribute_id'][1] + ' / ' + attribute_value['name']
                    self.product_attribute_value_by_id[attribute_value.id] = attribute_value;
                    if (!self.product_attribute_value_by_attribute_id[attribute_value['attribute_id'][0]]) {
                        self.product_attribute_value_by_attribute_id[attribute_value['attribute_id'][0]] = [attribute_value]
                    } else {
                        self.product_attribute_value_by_attribute_id[attribute_value['attribute_id'][0]].push(attribute_value)
                    }
                }
            }
        },
        {
            label: 'Product Attributes',
            model: 'product.template.attribute.value',
            fields: ['name', 'product_attribute_value_id', 'attribute_id', 'product_tmpl_id'],
            domain: function (self) {
                return [['product_tmpl_id', '!=', null]];
            },
            loaded: function (self, template_attribute_values) {
                self.template_attribute_values = template_attribute_values;
                self.values_by_attribute_id = {}
                self.values_by_value_id = {}
                for (let i = 0; i < template_attribute_values.length; i++) {
                    let template_attribute_value = template_attribute_values[i];
                    if (!self.values_by_attribute_id[template_attribute_value['attribute_id'][0]]) {
                        self.values_by_attribute_id[template_attribute_value['attribute_id'][0]] = [template_attribute_value['id']]
                    } else {
                        self.values_by_attribute_id[template_attribute_value['attribute_id'][0]].push(template_attribute_value['id'])
                    }
                    if (!self.values_by_value_id[template_attribute_value['product_attribute_value_id'][0]]) {
                        self.values_by_value_id[template_attribute_value['product_attribute_value_id'][0]] = [template_attribute_value['id']]
                    } else {
                        self.values_by_value_id[template_attribute_value['product_attribute_value_id'][0]].push(template_attribute_value['id'])
                    }
                }
            }
        },
        {
            label: 'Suggest Cash Amount Payment',
            model: 'pos.quickly.payment',
            fields: ['name', 'amount', 'type'],
            condition: function (self) {
                return self.config.payment_coin;
            },
            domain: function (self) {
                return [['id', 'in', self.config.payment_coin_ids]]
            },
            context: {'pos': true},
            loaded: function (self, payment_coins) {
                self.payment_coins = payment_coins;
            }
        },
        {
            model: 'account.payment.term',
            fields: ['name'],
            domain: [],
            context: {'pos': true},
            loaded: function (self, payments_term) {
                self.payments_term = payments_term;
            }
        }, {
            model: 'product.cross',
            fields: ['product_id', 'list_price', 'quantity', 'discount_type', 'discount', 'product_tmpl_id'],
            domain: [],
            loaded: function (self, cross_items) {
                self.cross_items = cross_items;
                self.cross_item_by_id = {};
                self.cross_items_by_product_tmpl_id = {}
                for (let i = 0; i < cross_items.length; i++) {
                    let item = cross_items[i];
                    item.display_name = item.product_id[1];
                    item.display_name += _t(', Discount type: ') + item.discount_type
                    item.display_name += _t(', Discount value: ') + item.discount
                    self.cross_item_by_id[item['id']] = item;
                    if (!self.cross_items_by_product_tmpl_id[item.product_tmpl_id[0]]) {
                        self.cross_items_by_product_tmpl_id[item.product_tmpl_id[0]] = [item]
                    } else {
                        self.cross_items_by_product_tmpl_id[item.product_tmpl_id[0]].push(item)
                    }
                }
            }
        }, {
            model: 'pos.config',
            fields: [],
            domain: function (self) {
                return []
            },
            loaded: function (self, configs) {
                self.config_by_id = {};
                self.configs = configs;
                for (let i = 0; i < configs.length; i++) {
                    let config = configs[i];
                    self.config_by_id[config['id']] = config;
                    if (self.config['id'] == config['id'] && config.logo) {
                        self.config.logo_shop = 'data:image/png;base64,' + config.logo
                    }
                }
                if (self.config_id) {
                    let config = _.find(configs, function (config) {
                        return config['id'] == self.config_id
                    });
                    if (config) {
                        let user = self.user_by_id[config.user_id[0]]
                        if (user) {
                            self.set_cashier(user);
                        }
                    }
                }
                let restaurant_order_config = configs.find(f => f.restaurant_order)
                self.restaurant_order_config = restaurant_order_config
            }
        },
        {
            label: 'Product Template Attribute Value',
            model: 'product.template.attribute.value',
            fields: [],
            loaded: function (self, attribute_values) {
                self.attribute_value_by_id = {};
                for (let i = 0; i < attribute_values.length; i++) {
                    let attribute_value = attribute_values[i];
                    self.attribute_value_by_id[attribute_value.id] = attribute_value;
                }
            }
        },
        {
            label: 'Journals',
            model: 'account.journal', // TODO: loading journal and linked pos_method_type to payment_methods variable of posmodel
            fields: ['name', 'code', 'pos_method_type', 'profit_account_id', 'loss_account_id', 'currency_id', 'decimal_rounding', 'inbound_payment_method_ids', 'outbound_payment_method_ids'],
            domain: function (self) {
                return ['|', '|', '|', ['id', 'in', self.config.payment_journal_ids], ['type', '=', 'bank'], ['type', '=', 'cash'], ['company_id', '=', self.company.id]]
            },
            loaded: function (self, account_journals) {
                self.payment_journals = [];
                self.account_journals = account_journals;
                self.normal_payment_methods = [] // todo: this methods will display on payment screen
                self.journal_by_id = {};
                for (let i = 0; i < account_journals.length; i++) {
                    let account_journal = account_journals[i];
                    self.journal_by_id[account_journal.id] = account_journal;
                    if (!account_journal.currency_id) {
                        account_journal.currency_id = self.config.currency_id;
                    }
                    if (self.config.payment_journal_ids.indexOf(account_journal.id) != -1) {
                        self.payment_journals.push(account_journal)
                    }
                }
                if (self.payment_methods) {
                    for (let i = 0; i < self.payment_methods.length; i++) {
                        let payment_method = self.payment_methods[i];
                        if (payment_method.cash_journal_id) {
                            payment_method.journal = self.journal_by_id[payment_method.cash_journal_id[0]];
                            payment_method.pos_method_type = payment_method.journal['pos_method_type']
                            if (payment_method.pos_method_type == 'default') {
                                self.normal_payment_methods.push(payment_method)
                            }
                        } else {
                            self.normal_payment_methods.push(payment_method)
                        }
                    }
                }
            }
        },
        {
            label: 'Bill Of Material',
            model: 'mrp.bom',
            fields: ['product_tmpl_id', 'product_id', 'code'],
            condition: function (self) {
                return self.config.mrp == true;
            },
            domain: function (self) {
                return [['product_id', '!=', false]]
            },
            context: {'pos': true},
            loaded: function (self, boms) {
                self.boms = boms;
                self.bom_ids = [];
                self.bom_by_id = {};
                self.bom_by_product_id = {};
                for (let i = 0; i < boms.length; i++) {
                    let bom = boms[i];
                    bom['bom_line_ids'] = [];
                    self.bom_ids.push(bom.id)
                    self.bom_by_id[bom.id] = bom
                    if (bom['product_id']) {
                        if (!self.bom_by_product_id[bom.product_id[0]]) {
                            self.bom_by_product_id[bom.product_id[0]] = [bom]
                        } else {
                            self.bom_by_product_id[bom.product_id[0]].push(bom)
                        }
                    }
                }
            }
        },
        {
            label: 'Bill Of Material Lines',
            model: 'mrp.bom.line',
            fields: ['product_qty', 'product_id', 'bom_id', 'price_extra'],
            condition: function (self) {
                return self.config.mrp == true;
            },
            domain: function (self) {
                return [['bom_id', 'in', self.bom_ids]]
            },
            context: {'pos': true},
            loaded: function (self, bom_lines) {
                self.bom_line_by_id = {};
                for (let i = 0; i < bom_lines.length; i++) {
                    let bom_line = bom_lines[i];
                    if (self.bom_by_id[bom_line.bom_id[0]]) {
                        let bom = self.bom_by_id[bom_line.bom_id[0]];
                        bom['bom_line_ids'].push(bom_line)
                    }
                    self.bom_line_by_id[bom_line.id] = bom_line;
                }
            }
        },
        {
            label: 'Vouchers',
            model: 'pos.voucher', // load vouchers
            fields: ['code', 'value', 'apply_type', 'method', 'use_date', 'number'],
            domain: [['state', '=', 'active']],
            context: {'pos': true},
            loaded: function (self, vouchers) {
                self.vouchers = vouchers;
                self.voucher_by_id = {};
                for (let x = 0; x < vouchers.length; x++) {
                    self.voucher_by_id[vouchers[x].id] = vouchers[x];
                }
            }
        },
        {
            label: 'Product Price by Quantity',
            model: 'product.price.quantity', // product price quantity
            fields: ['quantity', 'price_unit', 'product_tmpl_id'],
            loaded: function (self, records) {
                self.price_each_qty_by_product_tmpl_id = {};
                for (let i = 0; i < records.length; i++) {
                    let record = records[i];
                    let product_tmpl_id = record['product_tmpl_id'][0];
                    if (!self.price_each_qty_by_product_tmpl_id[product_tmpl_id]) {
                        self.price_each_qty_by_product_tmpl_id[product_tmpl_id] = [record];
                    } else {
                        self.price_each_qty_by_product_tmpl_id[product_tmpl_id].push(record);
                    }
                }
            }
        },
        {
            label: 'Stock Picking',
            model: 'stock.picking',
            fields: ['id', 'pos_order_id'],
            condition: function (self) {
                return self.config.pos_orders_management;
            },
            domain: [['is_picking_combo', '=', true], ['pos_order_id', '!=', null]],
            loaded: function (self, combo_pickings) {
                self.combo_pickings = combo_pickings;
                self.combo_picking_by_order_id = {};
                self.combo_picking_ids = [];
                for (let i = 0; i < combo_pickings.length; i++) {
                    let combo_picking = combo_pickings[i];
                    self.combo_picking_by_order_id[combo_picking.pos_order_id[0]] = combo_picking.id;
                    self.combo_picking_ids.push(combo_picking.id)
                }
            }
        },
        {
            label: 'Stock Move',
            model: 'stock.move',
            fields: ['combo_item_id', 'picking_id', 'product_id', 'product_uom_qty'],
            condition: function (self) {
                return self.config.pos_orders_management;
            },
            domain: function (self) {
                return [['picking_id', 'in', self.combo_picking_ids]]
            },
            loaded: function (self, moves) {
                self.stock_moves_by_picking_id = {};
                for (let i = 0; i < moves.length; i++) {
                    let move = moves[i];
                    if (!self.stock_moves_by_picking_id[move.picking_id[0]]) {
                        self.stock_moves_by_picking_id[move.picking_id[0]] = [move]
                    } else {
                        self.stock_moves_by_picking_id[move.picking_id[0]].push(move)
                    }
                }
            }
        },
        {
            label: 'Partner Titles',
            model: 'res.partner.title',
            condition: function (self) {
                return !self.config.hide_title
            },
            fields: ['name'],
            loaded: function (self, partner_titles) {
                self.partner_titles = partner_titles;
                self.partner_title_by_id = {};
                for (let i = 0; i < partner_titles.length; i++) {
                    let title = partner_titles[i];
                    self.partner_title_by_id[title.id] = title;
                }
            }
        },
        {
            label: 'Combo Items Limited',
            model: 'pos.combo.limit',
            fields: ['product_tmpl_id', 'pos_categ_id', 'quantity_limited', 'default_product_ids'],
            loaded: function (self, combo_limiteds) {
                self.combo_limiteds = combo_limiteds;
                self.combo_limiteds_by_product_tmpl_id = {};
                self.combo_category_limited_by_product_tmpl_id = {};
                for (let i = 0; i < combo_limiteds.length; i++) {
                    let combo_limited = combo_limiteds[i];
                    if (self.combo_limiteds_by_product_tmpl_id[combo_limited.product_tmpl_id[0]]) {
                        self.combo_limiteds_by_product_tmpl_id[combo_limited.product_tmpl_id[0]].push(combo_limited);
                    } else {
                        self.combo_limiteds_by_product_tmpl_id[combo_limited.product_tmpl_id[0]] = [combo_limited];
                    }
                    if (!self.combo_category_limited_by_product_tmpl_id[combo_limited.product_tmpl_id[0]]) {
                        self.combo_category_limited_by_product_tmpl_id[combo_limited.product_tmpl_id[0]] = {};
                        self.combo_category_limited_by_product_tmpl_id[combo_limited.product_tmpl_id[0]][combo_limited.pos_categ_id[0]] = combo_limited.quantity_limited;
                    } else {
                        self.combo_category_limited_by_product_tmpl_id[combo_limited.product_tmpl_id[0]][combo_limited.pos_categ_id[0]] = combo_limited.quantity_limited;
                    }
                }
            }
        },
        // {
        //     label: 'Shop Logo', // shop logo
        //     condition: function (self) {
        //         return true
        //     },
        //     loaded: function (self) {
        //         self.company_logo = new Image();
        //         return new Promise(function (resolve, reject) {
        //             self.company_logo.onload = function () {
        //                 let img = self.company_logo;
        //                 let ratio = 1;
        //                 let targetwidth = 300;
        //                 let maxheight = 150;
        //                 if (img.width !== targetwidth) {
        //                     ratio = targetwidth / img.width;
        //                 }
        //                 if (img.height * ratio > maxheight) {
        //                     ratio = maxheight / img.height;
        //                 }
        //                 let width = Math.floor(img.width * ratio);
        //                 let height = Math.floor(img.height * ratio);
        //                 let c = document.createElement('canvas');
        //                 c.width = width;
        //                 c.height = height;
        //                 let ctx = c.getContext('2d');
        //                 ctx.drawImage(self.company_logo, 0, 0, width, height);
        //
        //                 self.company_logo_base64 = c.toDataURL();
        //                 resolve()
        //
        //             };
        //             self.company_logo.onerror = function (error) {
        //                 return reject()
        //             };
        //             self.company_logo.crossOrigin = "anonymous";
        //             if (!self.is_mobile) {
        //                 self.company_logo.src = '/web/image' + '?model=pos.config&field=logo&id=' + self.config.id;
        //             } else {
        //                 self.company_logo.src = '/web/binary/company_logo' + '?dbname=' + self.session.db + '&write_date=' + self.company.write_date;
        //             }
        //         });
        //     },
        // },
    ];

    let _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        get_units_barcode_by_id: function (product_id) {
            let units = this.barcodes_by_product_id[product_id]
            if (!units) {
                return []
            }
            return units
        },
        get_taxes: function (product) {
            if (!product.taxes_id) {
                return []
            } else {
                taxes = []
                for (let i = 0; i < product.taxes_id.length; i++) {
                    let tax = this.taxes_by_id[product.taxes_id[i]];
                    if (tax) {
                        taxes.push(tax)
                    }
                }
                return taxes
            }
        },
        get_count_variant: function (product_tmpl_id) {
            if (this.db.total_variant_by_product_tmpl_id[product_tmpl_id]) {
                return this.db.total_variant_by_product_tmpl_id[product_tmpl_id]
            } else {
                return 0
            }
        },
        restore_orders: function () {
            let self = this;
            return rpc.query({
                model: 'pos.backup.orders',
                method: 'getUnpaidOrders',
                args: [[], {
                    config_id: this.config.id,
                }]
            }, {
                shadow: true,
                timeout: 60000
            }).then(function (unpaid_orders) {
                if (unpaid_orders.length) {
                    let restored = 0;
                    let json_orders = JSON.parse(unpaid_orders);
                    let rollback_orders = [];
                    for (let index in json_orders) {
                        let unpaid_order = json_orders[index];
                        let order_exist = _.find(self.db.get_unpaid_orders(), function (order) {
                            return order.uid == unpaid_order.uid
                        });
                        if (!order_exist) {
                            restored += 1;
                            console.log('[restore_orders] ' + restored + ' orders');
                            new models.Order({}, {
                                pos: self,
                                json: unpaid_order,
                            });
                        } else {
                            console.log(unpaid_order.uid + ' exist in your browse cache');
                        }
                    }
                    return rollback_orders;
                }
            });
        },
        automaticBackupUnpaidOrders: function () {
            let self = this;
            const unpaidOrders = this.db.get_unpaid_orders()
            console.log('[automaticBackupUnpaidOrders] total unpaid orders: ' + unpaidOrders.length)
            return rpc.query({
                model: 'pos.backup.orders',
                method: 'automaticBackupUnpaidOrders',
                args: [[], {
                    config_id: this.config.id,
                    unpaid_orders: unpaidOrders,
                    total_orders: unpaidOrders.length
                }]
            }, {
                shadow: true,
                timeout: 60000
            }).then(function (backup_id) {
                setTimeout(_.bind(self.automaticBackupUnpaidOrders, self), 5000);
            }, function (err) {
                setTimeout(_.bind(self.automaticBackupUnpaidOrders, self), 120000);
            });
        },


        polling_job_auto_paid_orders_draft: function () {
            let self = this;
            let params = {
                message: 'Automatic Paid Orders Draft have full fill payment',
                config_id: this.config.id
            };
            let sending = function () {
                return session.rpc("/pos/automation/paid_orders", params, {
                    shadow: true,
                    timeout: 65000,
                });
            };
            return sending().then(function (result) {
                result = JSON.parse(result);
                if (result['values'].length > 0) {
                    self.alert_message({
                        title: _t('Succeed'),
                        body: _t('Orders: ' + result['values'] + _t(' processed to paid')),
                        color: 'success'
                    })
                }
                setTimeout(_.bind(self.polling_job_auto_paid_orders_draft, self), 3000);
            }, function (err) {
                setTimeout(_.bind(self.polling_job_auto_paid_orders_draft, self), 3000);
            });
        },
        load_server_data: function () {
            console.log('load_server_data 5')
            const self = this;
            return _super_PosModel.load_server_data.apply(this, arguments).then(function () {
                let employee_ids = _.map(self.employees, function (employee) {
                    return employee.id;
                });
                let records = self.rpc({
                    model: 'hr.employee',
                    method: 'get_barcodes_and_pin_hashed',
                    args: [employee_ids],
                });
                records.then(function (employee_data) {
                    self.employees.forEach(function (employee) {
                        let data = _.findWhere(employee_data, {'id': employee.id});
                        if (data !== undefined) {
                            employee.barcode = data.barcode;
                            employee.pin = data.pin;
                        }
                    });
                });
                self.posSyncBackend = new exports.posSyncBackend(self);
                self.posSyncBackend.start();
                if (self.config.backup_orders_automatic) {
                    return self.restore_orders().then(function () {
                        self.automaticBackupUnpaidOrders();
                    })
                } else {
                    return true
                }
            })
        },
        initialize: function (session, attributes) {
            let pos_category_model = this.get_model('pos.category');
            if (pos_category_model) {
                pos_category_model.domain = function (self) {
                    if (self.config.limit_categories) {
                        return self.config.limit_categories && self.config.iface_available_categ_ids.length ? [['id', 'in', self.config.iface_available_categ_ids]] : [];
                    } else {
                        return []
                    }
                };
                pos_category_model.fields.push('image_128')
                pos_category_model.fields.push('category_type')

            }
            _super_PosModel.initialize.call(this, session, attributes);
            this.models = this.models.concat(extend_models);
        },
    });

    return exports;
});
