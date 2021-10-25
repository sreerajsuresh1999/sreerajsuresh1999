# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.tools import float_is_zero

import logging

_logger = logging.getLogger(__name__)

class PosOrderLineLot(models.Model):
    _inherit = "pos.pack.operation.lot"

    quantity = fields.Float('Quantity')
    lot_id = fields.Many2one('stock.production.lot', 'Lot/Serial Number')

class PosOrder(models.Model):
    _inherit = "pos.order"

    def set_pack_operation_lot(self, picking=None):
        """Set Serial/Lot number in pack operations to mark the pack operation done."""
        """
        TODO  we foce core odoo because: we get lot id direct pos operation lot \n
        And if order return we dont care lots_necessary, auto add back lot ID
        """

        StockProductionLot = self.env['stock.production.lot']
        PosPackOperationLot = self.env['pos.pack.operation.lot']
        has_wrong_lots = False
        for order in self:
            for move in (picking or self.picking_ids[0]).move_lines:
                picking_type = (picking or self.picking_id).picking_type_id
                lots_necessary = True
                if picking_type:
                    lots_necessary = picking_type and picking_type.use_existing_lots
                qty_done = 0
                pack_lots = []
                pos_pack_lots = PosPackOperationLot.search([
                    ('order_id', '=', order.id),
                    ('product_id', '=', move.product_id.id)
                ])
                if pos_pack_lots and (lots_necessary or order.is_return):
                    for pos_pack_lot in pos_pack_lots:
                        stock_production_lot = StockProductionLot.search([('name', '=', pos_pack_lot.lot_name), ('product_id', '=', move.product_id.id)])
                        if stock_production_lot:
                            # a serialnumber always has a quantity of 1 product, a lot number takes the full quantity of the order line
                            qty = 1.0
                            if stock_production_lot.product_id.tracking == 'lot':
                                qty = abs(pos_pack_lot.pos_order_line_id.qty)
                            qty_done += qty
                            if pos_pack_lot.lot_id:
                                pack_lots.append({
                                    'lot_id': pos_pack_lot.lot_id.id,
                                    'qty': qty,
                                    'lot_name': pack_lot.lot_id.name
                                })
                            else:
                                pack_lots.append({
                                    'lot_id': stock_production_lot.id,
                                    'qty': qty,
                                    'lot_name': stock_production_lot.name
                                })
                        else:
                            has_wrong_lots = True
                elif move.product_id.tracking == 'none' or not lots_necessary:
                    qty_done = move.product_uom_qty
                else:
                    has_wrong_lots = True
                for pack_lot in pack_lots:
                    lot_id, qty, lot_name = pack_lot['lot_id'], pack_lot['qty'], pack_lot['lot_name']
                    self.env['stock.move.line'].create({
                        'picking_id': move.picking_id.id,
                        'move_id': move.id,
                        'product_id': move.product_id.id,
                        'product_uom_id': move.product_uom.id,
                        'qty_done': qty,
                        'location_id': move.location_id.id,
                        'location_dest_id': move.location_dest_id.id,
                        'lot_id': lot_id,
                        'lot_name': lot_name,
                    })
                if not pack_lots and not float_is_zero(qty_done, precision_rounding=move.product_uom.rounding):
                    if len(move._get_move_lines()) < 2:
                        move.quantity_done = qty_done
                    else:
                        move._set_quantity_done(qty_done)
        return has_wrong_lots