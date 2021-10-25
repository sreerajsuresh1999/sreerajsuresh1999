from odoo import models, fields


class WeeklyPurchase(models.Model):
    _name = 'weekly.purchase'

    partner_id = fields.Many2one('res.partner')
    prod_categ_id = fields.Many2one('product.category', string='Product Category')
    start_date = fields.Datetime(string='Date')
    quantity = fields.Float(string='Quantity')
