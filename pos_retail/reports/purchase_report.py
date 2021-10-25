# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models

class PurchaseReport(models.Model):
    _inherit = "purchase.report"

    pos_branch_id = fields.Many2one('pos.branch')

    def _select(self):
        return super(PurchaseReport, self)._select() + ", po.pos_branch_id as pos_branch_id"

    def _group_by(self):
        return super(PurchaseReport, self)._group_by() + ", po.pos_branch_id"