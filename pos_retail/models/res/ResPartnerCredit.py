# -*- coding: utf-8 -*-
from odoo import api, fields, models, tools, _

class res_partner_credit(models.Model):
    _name = "res.partner.credit"
    _description = "Customer credit"

    name = fields.Char('Name', required=1)
    amount = fields.Float('Amount', required=1)
    type = fields.Selection([
        ('plus', 'Plus Amount'),
        ('redeem', 'Redeem Amount')
    ], required=1)
    partner_id = fields.Many2one('res.partner', 'Customer', required=1)
    pos_order_id = fields.Many2one('pos.order', 'POS order', readonly=1)
    create_date = fields.Datetime('Created date', readonly=1)
    payment_id = fields.Many2one('pos.payment', 'Payment Used', readonly=1)
    active = fields.Boolean('Active', default=1)
    move_id = fields.Many2one('account.move', 'Credit Note', readonly=1)
