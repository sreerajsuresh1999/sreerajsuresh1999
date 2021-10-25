# -*- coding: utf-8 -*-
from odoo import api, models, fields, registry
import logging

_logger = logging.getLogger(__name__)

class PosBranch(models.Model):
    _name = "pos.branch"
    _description = "Branch of shops, like a multi company"

    name = fields.Char('Name', required=1)
    user_id = fields.Many2one(
        'res.users',
        'Branch Manager',
        required=1,
        help='Manager of this Branch'
    )
    user_ids = fields.Many2many(
        'res.users',
        'pos_branch_res_users_rel',
        'branch_id',
        'user_id',
        string='Branch Users',
        help='Users have added here, them will see any datas have linked to this Branch'
    )
    config_ids = fields.One2many(
        'pos.config',
        'pos_branch_id',
        string='POS of this Branch',
        readonly=1,
        help='Point of Sales has assigned of this Branch'
    )

    def assign_branch_to_users(self):
        for branch in self:
            for user in branch.user_ids:
                user.sudo().write({
                    'pos_branch_id': branch.id
                })
        return True

    def get_default_branch(self):
        if self.env.user.pos_branch_id:
            return self.env.user.pos_branch_id.id
        else:
            branches = self.sudo().search(['|', ('user_ids', 'child_of', [self.env.user.id]), ('user_id', '=', self.env.user.id)])
            if branches:
                return branches[0].id
            else:
                _logger.info('[get_default_branch] User [ %s ] have not set Branch' % self.env.user.login)
                return None