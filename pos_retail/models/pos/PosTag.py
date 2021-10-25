# -*- coding: utf-8 -*-
from odoo import models, fields, api, _

class pos_tag(models.Model):
    _name = "pos.tag"
    _description = "Management Order line tags"

    name = fields.Char('Name', required=1)
    color = fields.Char("Color Tag", default=0)
    is_return_reason = fields.Boolean('Is return Reason')