# -*- coding: utf-8 -*-
from odoo import fields, models, _, api

class stock_immediate_transfer(models.TransientModel):

    _inherit = 'stock.immediate.transfer'

    @api.model
    def pos_made_picking_done(self, picking_id):
        transfer = self.create({
            'pick_ids': [(4, picking_id)]
        })
        return transfer.process()