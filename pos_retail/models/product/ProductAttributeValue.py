# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class ProductAttributeValue(models.Model):
    _inherit = "product.attribute.value"

    pizza_modifier = fields.Boolean('Pizza Modifier', default=1)