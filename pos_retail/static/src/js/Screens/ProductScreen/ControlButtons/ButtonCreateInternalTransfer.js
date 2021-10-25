odoo.define('pos_retail.ButtonCreateInternalTransfer', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonCreateInternalTransfer extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
        }

        get getCount() {
            return this.count;
        }

        async onClick() {
            var self = this;
            let allLocations = await this.rpc({
                model: 'stock.location',
                method: 'search_read',
                domain: [['usage', '=', 'internal']],
                fields: ['display_name', 'id']
            }).then(function (locations) {
                return locations
            }, function (error) {
                return self.env.pos.query_backend_fail(error)
            })
            let orderSelected = this.env.pos.get_order();
            if (orderSelected.orderlines.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Your order is blank cart'),
                });
            }
            let toDay = new Date().toISOString().split('T')[0];
            let defaultProps = {
                title: this.env._t('Create Internal Transfer, between Stock Location'),
                note: orderSelected.get_note(),
                stock_picking_types: this.env.pos.stock_picking_types,
                stock_locations: allLocations,
                picking_type_id: this.env.pos.stock_picking_types[0].id,
                location_id: allLocations[0].id,
                location_dest_id: allLocations[0].id,
                move_type: 'direct',
                priority: '0',
                scheduled_date: toDay,
            }
            let {confirmed, payload: fields} = await this.showPopup('PopUpCreateInternalTransfer', defaultProps)
            if (confirmed) {
                if (!fields.scheduled_date) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Scheduled date is required')
                    })
                }
                if (fields.location_id == fields.location_dest_id) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Source and Destination location required difference')
                    })
                }
                var moveLines = [];
                var length = orderSelected.orderlines.length;
                for (var i = 0; i < length; i++) {
                    var line = orderSelected.orderlines.models[i];
                    var line_json = line.export_as_JSON();
                    var pack_lots = [];
                    if (line.product.tracking == 'lot') {
                        if (line_json.pack_lot_ids.length == 0) {
                            return this.showPopup('ConfirmPopup', {
                                title: this.env._t('Error'),
                                body: line.product.display_name + this.env._t(' Tracking by Lot, Required add Lot and quantity. Total quantity set to pack lots the same quantity of line'),
                        disableCancelButton: true,
                            });
                        } else {
                            var quantity_by_lot = 0;
                            for (var j = 0; j < line_json.pack_lot_ids.length; j++) {
                                quantity_by_lot += line_json.pack_lot_ids[j][2]['quantity']
                                pack_lots.push(line_json.pack_lot_ids[j][2])
                            }
                            if (line_json.qty > quantity_by_lot) {
                                return this.showPopup('ConfirmPopup', {
                                    title: this.env._t('Error'),
                                    body: this.env._t('Total Quantity of Product ') + line.product.name + _t(' is ') + line_json.qty + _t(' but Total Quantity of Lot Set is ') + quantity_by_lot + _t('. Please set quantity line and lot the same.'),
                        disableCancelButton: true,
                                });
                            }
                        }
                    }
                    var product = this.env.pos.db.get_product_by_id(line.product.id);
                    if (product['uom_po_id'] == undefined || !product['uom_po_id'] || product['type'] == 'service') {
                        continue
                    } else {
                        moveLines.push({
                            pack_lots: pack_lots,
                            name: line.product.display_name,
                            picking_type_id: parseInt(fields.picking_type_id),
                            location_id: parseInt(fields.location_id),
                            location_dest_id: parseInt(fields.location_dest_id),
                            product_id: line.product.id,
                            product_uom_qty: line.quantity,
                            product_uom:line.product.uom_po_id[0]
                        });
                    }
                }
                if (moveLines.length == 0) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Have not any products in cart have type is: Storable Product, it not possible create Internal Transfer')
                    });
                }
                let pickingVals = {
                    is_locked: true,
                    origin: orderSelected['name'],
                    picking_type_id: parseInt(fields['picking_type_id']),
                    location_id: parseInt(fields['location_id']),
                    location_dest_id: parseInt(fields['location_dest_id']),
                    move_type: fields['move_type'],
                    note: fields['note'],
                    scheduled_date: fields['scheduled_date'],
                    immediate_transfer: true,
                };
                let internalTransfer = await this.rpc({
                    model: 'stock.picking',
                    method: 'pos_made_internal_transfer',
                    args: [pickingVals, moveLines],
                    context: {}
                }).then(function (value) {
                    return value
                }, function (error) {
                    return self.env.pos.query_backend_fail(error)
                })
                if (internalTransfer && internalTransfer.id) {
                    orderSelected.temporary = true;
                    orderSelected.internal_ref = internalTransfer.internal_ref;
                    let link = window.location.origin + "/web#id=" + internalTransfer.id + "&view_type=form&model=stock.picking";
                    window.open(link, '_blank');
                    this.env.pos.db.remove_unpaid_order(orderSelected);
                    this.env.pos.db.remove_order(orderSelected['uid']);
                    this.showScreen('ReceiptScreen');
                }
                if (internalTransfer.error) {
                    this.env.pos.alert_message({
                        title: this.env._t(internalTransfer.error)
                    })
                }
            }
        }
    }

    ButtonCreateInternalTransfer.template = 'ButtonCreateInternalTransfer';

    ProductScreen.addControlButton({
        component: ButtonCreateInternalTransfer,
        condition: function () {
            return this.env.pos.stock_picking_types && this.env.pos.stock_locations && this.env.pos.config.internal_transfer;
        },
    });

    Registries.Component.add(ButtonCreateInternalTransfer);

    return ButtonCreateInternalTransfer;
});
