from odoo import tools
from odoo import api, fields, models


class pos_tracking_client(models.TransientModel):
    _name = "pos.tracking.client"
    _description = "Report tracking actions of cashiers"

    name = fields.Char()
    user_id = fields.Many2one('res.users', 'Client', readonly=1)
    number = fields.Integer('Number', readonly=1)
    action = fields.Selection([
        ('selected_order', 'Change order'),
        ('new_order', 'Add order'),
        ('unlink_order', 'Remove order'),
        ('line_removing', 'Remove line'),
        ('set_client', 'Set customer'),
        ('trigger_update_line', 'Update line'),
        ('change_pricelist', 'Add pricelist'),
        ('sync_sequence_number', 'Sync sequence order'),
        ('lock_order', 'Lock order'),
        ('unlock_order', 'Unlock order'),
        ('set_line_note', 'Set note'),
        ('set_state', 'Set state'),
        ('order_transfer_new_table', 'Transfer to new table'),
        ('set_customer_count', 'Set guest'),
        ('request_printer', 'Request printer'),
        ('set_note', 'Set note'),
    ], string='Action', readonly=1)