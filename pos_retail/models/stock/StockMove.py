# -*- coding: utf-8 -*-
from odoo import fields, api, models

import logging
import base64
import json

_logger = logging.getLogger(__name__)


class StockMove(models.Model):
    _inherit = "stock.move"

    combo_item_id = fields.Many2one('pos.combo.item', 'Combo Item')
    pos_branch_id = fields.Many2one('pos.branch', string='Branch', readonly=1)

    @api.model
    def create(self, vals):
        Picking = self.env['stock.picking'].sudo()
        if vals.get('picking_id', None):
            picking = Picking.browse(vals.get('picking_id'))
            if picking.pos_branch_id:
                vals.update({'pos_branch_id': picking.pos_branch_id.id})
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        return super(StockMove, self).create(vals)

class StockMoveLine(models.Model):
    _inherit = "stock.move.line"

    pos_branch_id = fields.Many2one('pos.branch', string='Branch', readonly=1)

    @api.model
    def create(self, vals):
        if vals.get('picking_id', None):
            picking = self.env['stock.picking'].browse(vals.get('picking_id'))
            # todo: in this step have 2 case
            # todo 1: if picking create from pos order, nothing problem, force all location of stock move line from order location id
            # todo 2: if is picking return, no need force location id, because location is is customer location
            # if picking.pos_order_id and picking.pos_order_id.location_id and picking.location_id and picking.location_id.id == picking.pos_order_id.location_id.id:
            #     vals.update({'location_id': picking.pos_order_id.location_id.id})
            if picking.pos_branch_id:
                vals.update({'pos_branch_id': picking.pos_branch_id.id})
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        if vals.get('move_id', None):
            move = self.env['stock.move'].browse(vals.get('move_id'))
            if move.sale_line_id and move.sale_line_id.lot_id:
                vals.update({'lot_id': move.sale_line_id.lot_id.id})
        return super(StockMoveLine, self).create(vals)


