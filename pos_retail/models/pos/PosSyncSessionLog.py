# -*- coding: utf-8 -*-
from odoo import api, models, fields, registry, tools
import logging

_logger = logging.getLogger(__name__)

class pos_bus_log(models.TransientModel):
    _name = "pos.bus.log"
    _description = "Transactions of Point Sync"


class PosSyncSessionLog(models.Model):
    _name = "pos.sync.session.log"
    _description = "Transactions Logs of POS Users"
    _rec_name = "user_id"

    order_uid = fields.Char('Order Ref')
    create_date = fields.Datetime('Action Date', readonly=1)
    send_from_session_id = fields.Many2one(
        'pos.session',
        string='Send from Session',
        required=1,
        readonly=1
    )
    send_to_session_id = fields.Many2one(
        'pos.session',
        string='Send to Session',
        readonly=1
    )
    user_id = fields.Many2one(
        'res.users', 'User Action',
        required=1,
        ondelete='cascade',
        readonly=1,
    )
    user_receive_id = fields.Many2one(
        'res.users', 'User Receive',
        ondelete='cascade',
        readonly=1,
    )
    action = fields.Selection([
        ('none', 'None'),
        ('selected_order', 'Selected Order'),
        ('new_order', 'New Order'),
        ('unlink_order', 'Removed Order'),
        ('line_removing', 'Removed line'),
        ('set_client', 'Add Customer to Order'),
        ('trigger_update_line', 'Updated line'),
        ('change_pricelist', 'Add Pricelist to Order'),
        ('sync_sequence_number', 'Sync sequence order'),
        ('lock_order', 'Locked Order'),
        ('unlock_order', 'Unlock Order'),
        ('set_line_note', 'Set Line Note'),
        ('order_transfer_new_table', 'Transfer to New Table'),
        ('set_customer_count', 'Set Guest'),
        ('request_printer', 'Print Bill to Kitchen'),
        ('set_note', 'Set Order Note'),
        ('paid_order', 'Paid Order')
    ],
        string='Action',
        required=1,
        readonly=1,
        default='none'
    )
    logs = fields.Text(
        'Logs',
        required=1,
        readonly=1
    )
    state = fields.Selection([
        ('ready', 'Ready'),
        ('restored', 'Restored')
    ],
        string='State',
        default='ready',
        help='State of Log\n'
             '- Ready: is log new\n'
             '- Restored: restored back to send to session'
    )