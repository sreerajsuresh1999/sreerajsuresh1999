from odoo import models, fields


class ResPartner(models.Model):
    _inherit = 'res.partner'

    weekly_purchase_ids = fields.One2many('weekly.purchase', 'partner_id', string='Weekly Purchases')
    customer_type = fields.Selection([('adult', 'Adult'), ('medical', 'Medical')], string='Customer Type')
