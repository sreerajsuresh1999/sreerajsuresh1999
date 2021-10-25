# -*- coding: utf-8 -*-
from odoo import api, fields, models, tools, _

class ResPartnerGroup(models.Model):
    _name = "res.partner.group"
    _description = "Customers group"
    _description = "Customers Group/Membership Management"

    name = fields.Char('Name', required=1)
    pricelist_applied = fields.Boolean('Replace Customer PriceList')
    pricelist_id = fields.Many2one(
        'product.pricelist',
        'Pricelist Applied',
        help='When POS cashiers scan membership card on pos screen \n'
             'If customer exist inside this Group, this pricelist will apply to order customer'
    )
    image = fields.Binary('Card Image', required=1)
    height = fields.Integer('Card Image Height', default=120)
    width = fields.Integer('Card Image Width', default=300)
