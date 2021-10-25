# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
import json


class PosConfig(models.Model):
    _inherit = "pos.config"

    screen_type = fields.Selection([
        ('waiter', 'Waiter Screen'),
        ('kitchen', 'Kitchen Order Tickets (KOT) Screen'),
    ],
        string='Screen Type',
        default='waiter',
        help='Waiter Screen: is screen of waiters/cashiers take Order and submit Order to Kitchen\n'
             'Kitchen Screen: is screen of kitchen users save requested of Waiters/Cashiers'
    )
    display_table = fields.Boolean(
        'Display Tables',
        help='Display Tables on Kitchen/bar screen',
        default=1)
    display_all_product = fields.Boolean(
        'Display all Products',
        default=1)
    kitchen_screen = fields.Boolean(
        'Kitchen Order Tickets (KOT)',
        help='Example Waiter Delivery Man need management Tickets for delivery Products to Customers \n'
             'Checked to this field for them can see Tickets Kitchen Screen'
    )
    takeaway_order = fields.Boolean(
        'Take Away Order',
        default=0,
        help='It is type of Submit Kitchen Order Ticket \n'
             'Normally when add products to Card and click Order Button, it default Order for Customer come restaurant and sit down at Table \n'
             'Take Away is customer come Restaurant and Order and Leave when Order Done. \n'
             'Take Away only difference Order basic of Odoo is packaging \n'
             'And allow Kitchen Know Order is basic or Take Away for packaging'
    )
    product_categ_ids = fields.Many2many(
        'pos.category',
        'config_pos_category_rel',
        'config_id', 'categ_id',
        string='Product Categories Display',
        help='Categories of product will display on kitchen/bar screen')
    send_order_to_kitchen = fields.Boolean(
        'Send Order to Kitchen',
        default=1,
        help='Check if need waiters/cashiers send order information to kitchen/bar room without printers')
    auto_order = fields.Boolean(
        'Auto Submit Order to KOT Screen',
        help='When it checked, when waiters take Order for customer finished \n'
             'And go back Floor Screen, POS auto Order to Kitchen Screen'
    )
    set_lines_to_done = fields.Boolean(
        'Allow Set Lines to Done', default=1)
    allow_kitchen_cancel = fields.Boolean(
        'Allow Kitchen Cancel',
        help='Allow Kitchen Users Cancel request from waiter because some reasons'
    )
    required_input_reason_cancel = fields.Boolean(
        'Required Reason Cancel',
        help='When Kitchen Users cancel Line required input reason'
    )
    reason_cancel_reason_ids = fields.Many2many(
        'pos.tag',
        'cancel_reason_tag_rel',
        'config_id',
        'tag_id',
        string='Cancel Reason'
    )
    period_minutes_warning = fields.Float(
        'Period Minutes Warning Kitchen',
        default=15,
        help='Example input 15 (minutes) here, of each line request from Waiter to Kitchen \n'
             'have waiting (processing) times bigger than 15 minutes \n'
             'Item requested by Waiters on Kitchen Screen auto highlight red color'
    )
    order_receipt_tickets = fields.Text('Receipt Orders')
    qr_orders = fields.Text('QR Orders')

    restaurant_order = fields.Boolean('Restaurant Order')
    restaurant_order_login = fields.Char('Restaurant Order Login')
    restaurant_order_password = fields.Char('Restaurant Order Password')

    login_title = fields.Text(
        'Login Title',
        default='Welcome to Restaurant'
    )
    login_required = fields.Boolean('Required Customer Login')
    login_create_partner = fields.Boolean(
        'Automatic Add Customer',
        help='When customer register name and mobile \n'
             'Automatic create new customer if mobile does not exist in system'
    )
    qrcode_order_screen = fields.Boolean(
        'QrCode Orders',
        help='Management QRCode orders order by Customer'
    )
    qrcode_order_auto_alert = fields.Boolean(
        'Alert Popup when new Order Coming'
    )

    @api.onchange('restaurant_order')
    def onchange_restaurant_order(self):
        if self.restaurant_order:
            self.order_receipt_tickets = False
            self.backup_orders_automatic = False

    def save_order_tickets(self, tickets):
        return self.write({'order_receipt_tickets': json.dumps(tickets)})

    def save_qr_orders(self, qrorders):
        return self.write({'qr_orders': json.dumps(qrorders)})
