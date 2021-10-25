# -*- coding: utf-8 -*-
from odoo import api, models, fields, registry
import logging

_logger = logging.getLogger(__name__)


class pos_category(models.Model):
    _rec_name = 'sequence'
    _inherit = "pos.category"

    is_category_combo = fields.Boolean(
        'Is Combo Category',
        help='If it checked, \n'
             'When Pop-Up combo items show on POS Screen\n'
             'Pop-Up Only show POS Categories have Is Combo Category checked'
    )
    sale_limit_time = fields.Boolean('Sale Limit Time')
    from_time = fields.Float('Not allow sale from Time')
    to_time = fields.Float('Not allow sale To Time')
    submit_all_pos = fields.Boolean('Applied all Point Of Sale')
    pos_branch_ids = fields.Many2many(
        'pos.branch',
        'pos_category_branch_rel',
        'categ_id',
        'branch_id',
        string='Applied Branches')
    pos_config_ids = fields.Many2many(
        'pos.config',
        'pos_category_config_rel',
        'categ_id',
        'config_id',
        string='Point Of Sale Applied')
    category_type = fields.Selection([
        ('appetizer', 'Appetizer'),
        ('main', 'Main Course')
    ],
        default='appetizer',
        string='Category Type',
        help='If selected is [Main Course] when add new products to cart, will skip and not send to Kitchen \n'
             'Else if selected is [Appetizer] , always send to kitchen when waiters/cashier click to Order button \n'
             'When your waiters ready to send [Main Course] products to kitchen \n'
             '. Them can click to button send Main Course'
    )
