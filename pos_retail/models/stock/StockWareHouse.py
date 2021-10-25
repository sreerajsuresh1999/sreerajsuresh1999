# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class StockWarehouse(models.Model):
    _inherit = 'stock.warehouse'

    pos_branch_id = fields.Many2one(
        'pos.branch',
        string='Branch',
    )

    @api.model
    def create(self, vals):
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        warehouse = super(StockWarehouse, self).create(vals)
        return warehouse


class StockPickingType(models.Model):
    _inherit = 'stock.picking.type'

    pos_branch_id = fields.Many2one(
        'pos.branch',
        string='Branch',
    )
