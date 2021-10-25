# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ReportPosOrder(models.Model):
    _inherit = 'report.pos.order'

    pos_branch_id = fields.Many2one('pos.branch', 'Branch')
    seller_id = fields.Many2one('res.users', 'Sale Man')
    analytic_account_id = fields.Many2one(
        'account.analytic.account',
        'Analytic Account'
    )

    def _select(self):
        return super(ReportPosOrder, self)._select() + ", l.pos_branch_id as pos_branch_id, l.user_id as seller_id, l.analytic_account_id as analytic_account_id"

    def _group_by(self):
        return super(ReportPosOrder, self)._group_by() + ", l.pos_branch_id, l.user_id, l.analytic_account_id"
