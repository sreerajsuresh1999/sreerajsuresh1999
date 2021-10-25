# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
import logging
from odoo.exceptions import UserError, ValidationError
import re
import requests
import json
import base64

try:
    to_unicode = unicode
except NameError:
    to_unicode = str

_logger = logging.getLogger(__name__)


class PosConfig(models.Model):
    _inherit = "pos.config"

    def updateCache(self):
        return self.env['pos.call.log'].refresh_logs()

    def init(self):
        self.env.cr.execute(
            """DELETE FROM ir_model_data WHERE model IN ('pos.bus', 'pos.bus.log', 'pos.tracking.client')""");

    def _get_product_field_char(self):
        product_fields = self.env['ir.model.fields'].search(
            [('model', '=', 'product.product'),
             ('ttype', '=', 'char')])
        return [
            (field.name, field.field_description)
            for field in sorted(product_fields, key=lambda f: f.field_description)
        ]

    def _get_customer_field_char(self):
        product_fields = self.env['ir.model.fields'].search(
            [('model', '=', 'res.partner'),
             ('ttype', '=', 'char')])
        return [
            (field.name, field.field_description)
            for field in sorted(product_fields, key=lambda f: f.field_description)
        ]

    def _get_picking_field_char(self):
        picking_fields = self.env['ir.model.fields'].search(
            [('model', '=', 'stock.picking'),
             ('ttype', '=', 'char')])
        return [
            (field.name, field.field_description)
            for field in sorted(picking_fields, key=lambda f: f.field_description)
        ]

    def _get_invoice_field_char(self):
        invoice_fields = self.env['ir.model.fields'].search(
            [('model', '=', 'account.move'),
             ('ttype', '=', 'char')])
        return [
            (field.name, field.field_description)
            for field in sorted(invoice_fields, key=lambda f: f.field_description)
        ]

    printer_id = fields.Many2one(
        'pos.epson',
        'Printer Network',
        help='If you choice printer here \n'
             'Receipt Invoice willl printing directly to this printer IP'
    )
    floor_ids = fields.Many2many(
        'restaurant.floor',
        'pos_config_restaurant_floor_rel',
        'pos_config_id',
        'floor_id',
        string="Floors",
        domain=[('id', '!=', None)]
    )

    load_coupon_program = fields.Boolean(
        'Load Coupon Program',
        default=0,
    )
    coupon_program_apply_type = fields.Selection([
        ('manual', 'Manual Select'),
        ('auto', 'Automatic Apply when Pay')
    ], default='manual',
        help='If you choose [Manual Select], cashier required click to Coupons Programs button and choice Coupon Programs need applied \n'
             'If you choose [Automatic Apply when Pay], when cashier click Paid button, all Coupon Programs automatic add to Order '
    )
    coupon_program_ids = fields.Many2many(
        'coupon.program',
        'pos_config_coupon_program_rel',
        'pos_config_id',
        'coupon_id',
        domain=[('program_type', '=', 'promotion_program'), ('promo_applicability', '=', 'on_current_order')],
        string='Coupon Program')
    coupon_giftcard_ids = fields.Many2many(
        'coupon.program',
        'pos_config_coupon_giftcard_rel',
        'pos_config_id',
        'coupon_giftcard_id',
        domain=[('program_type', '=', 'coupon_program'), ('is_gift_card', '=', True)],
        string='Gift Card Program Template'
    )
    coupon_giftcard_create = fields.Boolean(
        'Allow POS Create Coupon',
        default=0,
    )
    user_id = fields.Many2one('res.users', 'Assigned to')
    allow_change_pos_profile = fields.Boolean('Allow Change POS Profile')
    allow_numpad = fields.Boolean('Allow Use Numpad', default=1)
    allow_discount = fields.Boolean('Allow Change Discount', default=1)
    allow_qty = fields.Boolean('Allow Change Quantity', default=1)
    allow_price = fields.Boolean('Allow Change Price', default=1)
    allow_remove_line = fields.Boolean('Allow Remove Line', default=1)
    allow_minus = fields.Boolean('Allow Minus (+/-)', default=1)
    allow_payment = fields.Boolean('Allow Payment', default=1)
    allow_customer = fields.Boolean('Allow set Customer', default=1)
    allow_add_order = fields.Boolean('Allow Add Order', default=1)
    allow_remove_order = fields.Boolean('Allow Remove Order', default=1)
    allow_add_product = fields.Boolean('Allow Add Product', default=1)
    allow_payment_zero = fields.Boolean(
        'Allow Payment Zero',
        default=1,
        help='If active, cashier can made order total amount smaller than or equal 0')
    allow_closing_session = fields.Boolean(
        default=1,
        string='Allow closing Session',
        help='If POS Users have not inside group Point Of Sale Manager \n'
             'And this field is un-checked \n'
             'POS Users will could not closing session'
    )
    allow_closing_all_sessions_online = fields.Boolean(
        default=0,
        string='Allow Closing All Sessions Online',
        help='If checked, this POS can closing all POS Sessions \n'
             'Of another POS Users direct on POS Screen'
    )
    allow_duplicate_session = fields.Boolean(
        'Allow Duplicate Session',
        help='If you checked (active) this checkbox \n'
             'Will allow user duplicate POS Screen Tab \n'
             'And opened POS Session at another Browse Device (Chrome, Firefox ...) \n'
             'If you uncheck, only allow 1 POS Session opened in 1 Current Time'
    )
    display_point_receipt = fields.Boolean(
        'Display Point / Receipt', help='Active this field for display loyalty\n'
                                        ' point plus on bill receipt')
    pos_loyalty_id = fields.Many2one(
        'pos.loyalty', 'Loyalty',
        domain=[('state', '=', 'running')])
    loyalty_combine_promotion = fields.Boolean(
        'Loyalty Combine Promotion',
        help='If checked: allow each order line, loyalty plus point and promotion apply together \n'
             'If not checked: When promotion add to order lines, points will not plus'
    )
    promotion_manual_select = fields.Boolean(
        'Promotion manual Choice', default=0,
        help='When you check to this checkbox, \n'
             'your cashiers will have one button, \n'
             'when cashiers clicked on it, \n'
             'all promotions active will display for choose')
    promotion_auto_add = fields.Boolean(
        'Promotion Auto Apply',
        help='All Promotion Active with Condition Items in Cart \n'
             'When Cashier click Paid button, all Promotions Active will add to Order')

    create_purchase_order = fields.Boolean('Create PO', default=0)
    create_purchase_order_required_signature = fields.Boolean(
        'PO Required Signature', default=0)
    purchase_order_state = fields.Selection([
        ('confirm_order', 'Auto Confirm'),
        ('confirm_picking', 'Auto Delivery'),
    ], 'Purchaser Order Auto',
        help='This is state of purchase order will process to',
        default='confirm_order')
    sale_order = fields.Boolean('Create Sale Order', default=0)
    sale_order_auto_confirm = fields.Boolean('Auto Confirm', default=0)
    sale_order_auto_invoice = fields.Boolean('Auto Paid', default=0)
    sale_order_auto_delivery = fields.Boolean('Auto Delivery', default=0)
    sale_order_required_signature = fields.Boolean(
        'SO Required Signature',
        help='Allow print receipt when create quotation/order')

    pos_orders_management = fields.Boolean(
        'POS Order Management',
        default=0)
    pos_order_tracking = fields.Boolean(
        'Tracking Order',
        help='Tracking Action of POS User on Order (example: remove/add order, change quantity/discount ....',
        default=0
    )
    pos_order_tracking_remove_when_closing_session = fields.Boolean(
        'Remove all Tracking Order Logs when Closing Session',
        default=0
    )
    shipping_order = fields.Boolean(
        'Shipping Order',
        default=1,
        help='Create Customer Order Delivery (COD) \n'
             'Allow cashiers create shipping address and save to Order, do partial payment Order \n'
             'When Delivery Man success shipping Order, Cashier confirm Order to Paid \n'
             'If you active this future, please active Partial Payment too\n'
             'For cashier add one part payment of Customer'
    )
    load_orders_type = fields.Selection([
        ('last_3_days', 'Last 3 Days'),
        ('last_7_days', 'Last 7 Days'),
        ('last_1_month', 'Last 1 Month'),
        ('last_1_year', 'Last 1 Year (365 days)'),
        ('load_all', 'Load All'),
    ],
        default='last_3_days',
        string='Period Days loading Orders'
    )
    pos_orders_load_orders_another_pos = fields.Boolean(
        'Allow Loading Orders of another POS',
        default=1
    )
    pos_orders_filter_by_branch = fields.Boolean(
        'POS Order Filter Branch', default=0,
        help='If you checked it, \n'
             'pos session could not see orders of another branch')
    pos_order_period_return_days = fields.Float(
        'Return Period Days',
        help='This is period days allow customer \n'
             'can return Order or one part of Order',
        default=30)
    required_reason_return = fields.Boolean(
        'Required Reason Return',
        help='Required Cashiers input Reason Return each line if Order is return'
    )
    display_return_days_receipt = fields.Boolean('Display Return Days on Receipt', default=0)
    display_onhand = fields.Boolean(
        'Show Stock on Hand each Product', default=1,
        help='Display quantity on hand all products on pos screen')
    allow_order_out_of_stock = fields.Boolean(
        'Allow Order when Product Out Of Stock',
        help='If uncheck, any product out of stock will blocked sale',
        default=1)
    allow_pos_categories_out_of_stock = fields.Many2many(
        'pos.category',
        'allow_pos_categories_out_of_stock',
        'pos_config_id',
        'pos_category_id',
        string='Allow some POS Categories can Sale when Out of Stock',
        help='Normally if [Allow Order when Product Out Of Stock] uncheck, if Products out of stock, POS will blocked sale. But if you set Categories here, it mean if Products of Categories added here will allow Sale when Out of Stock'
    )
    hide_product_when_outof_stock = fields.Boolean(
        'Hide Product Out Of Stock',
        default=0)
    print_voucher = fields.Boolean(
        'Create Voucher',
        help='Allow cashiers create Voucher Manual on POS',
        default=0)
    voucher_sequence_id = fields.Many2one('ir.sequence', 'Voucher Sequence')
    expired_days_voucher = fields.Integer(
        'Expired days of Voucher',
        default=30,
        help='Total days keep voucher can use, \n'
             'if out of period days from create date, voucher will expired')
    sync_multi_session = fields.Boolean('Sync between Sessions', default=0)
    sync_play_sound = fields.Boolean('Sync Play Sound', default=0,
                                     help='When have new sync notification, browse will play sound')
    sync_multi_session_with = fields.Char('Sync with', compute='_get_sync_with_sessions')
    sync_multi_session_manual_stop = fields.Boolean('Sync Can manual stop by Users')
    sync_multi_session_alert_remove_order = fields.Boolean('Popup Alert when another Sessions Remove Orders')
    sync_to_pos_config_ids = fields.Many2many(
        'pos.config',
        'sync_session_rel',
        'from_id',
        'to_id',
        string='Sync with Point Of Sale',
        domain="['|', ('pos_branch_id', '=', pos_branch_id), ('pos_branch_id', '=', None)]",
        help='Select POS Configs need sync with this POS Config \n' \
             'Any event change orders from this Session of this POS will sync to your selected POS Config Sessions \n'
    )
    sync_manual_button = fields.Boolean(
        'Sync Manual Order',
        help='Allow POS Session of This Config send Orders to another Sessions direct \n'
             'If another Sessions have the same Order with current Sessions \n'
             'Orders of another Sessions will replace by Orders send from current Session')
    sync_multi_session_offline = fields.Boolean(
        'Sync Between Session with Local Network',
        default=0,
        help='If not checked, normal sync between Sessions required Odoo Server Online \n'
             'If checked, we dont care Odoo offline or not \n'
             'All sync datas will sync direct POS/IOT Box'
    )
    sync_multi_session_offline_iot_ids = fields.Many2many(
        'pos.iot', 'pos_config_iot_rel', 'pos_config_id',
        'iot_box_id',
        string='IoT Boxes for Sync',
        help='Setup 1 pos/iot box \n'
             'And use it for Sync Point inside Your Shop/Restaurant Local Network \n'
             'This function only for our partnership \n'
             'If you need it, please go to our website: http://posodoo.com \n'
             'And looking to Professional Plan')
    sync_tracking_activities_user = fields.Boolean(
        'Tracking Activities User',
        default=1,
        help='Tracking all activities of POS User \n'
             'Example: add new product, remove line ....'
    )
    display_person_add_line = fields.Boolean('Display information Lines', default=0,
                                             help="When you checked, on pos order lines screen, \n"
                                                  "will display information person created order \n"
                                                  "(lines) Eg: create date, updated date ..")
    internal_transfer = fields.Boolean('Allow Internal Transfer', default=0,
                                       help='Go Inventory and active multi warehouse and location')

    discount = fields.Boolean('Active Global Discounts', default=0)
    discount_ids = fields.Many2many(
        'pos.global.discount',
        'config_discount_rel',
        'config_id',
        'discount_id',
        string='Global Discount Items'
    )
    delay = fields.Integer('Delay time', default=3000)

    discount_limit = fields.Boolean('Discount Limit', default=0)
    discount_limit_amount = fields.Float(
        'Discount Limit (%)',
        help='This is maximum disc (%) cashier can set to each line',
        default=0)
    return_products = fields.Boolean('Return Products or Orders',
                                     help='Allow cashier return products or orders',
                                     default=0)
    return_method_id = fields.Many2one(
        'pos.payment.method',
        string='Return Method'
    )
    return_covert_to_coupon = fields.Boolean(
        'Return via Coupon',
        help='Normally you return Orders/Products of Customer via cash refund back \n'
             'This feature help you refund via Coupon Card \n'
             'And Customer save it and use Coupon in next Order'
    )
    return_coupon_program_id = fields.Many2one(
        'coupon.program',
        domain=[('program_type', '=', 'coupon_program'), ('is_gift_card', '=', True)],
        string='Refund via Coupon Program'
    )
    return_duplicate = fields.Boolean(
        'Allow duplicate Return Order',
        help='If checked, one Order can return many times'
    )
    return_viva_scan_barcode = fields.Boolean(
        'Scan Barcode auto Return Order',
        default=1,
    )

    validate_payment = fields.Boolean('Validate Payment')
    validate_remove_order = fields.Boolean('Validate Remove Order')
    validate_new_order = fields.Boolean('Validate New Order')
    validate_change_minus = fields.Boolean('Validate Pressed +/-')
    validate_quantity_change = fields.Boolean('Validate Quantity Change')
    validate_quantity_change_type = fields.Selection([
        ('increase', 'Increase'),
        ('decrease', 'Decrease'),
        ('both', 'Both')
    ], string='Type of Validation Qty change', default='decrease')
    validate_price_change = fields.Boolean('Validate Price Change')
    validate_price_change_type = fields.Selection([
        ('increase', 'Increase'),
        ('decrease', 'Decrease'),
        ('both', 'Both')
    ], string='Type of Validation Price change', default='decrease')
    validate_discount_change = fields.Boolean('Validate Discount Change')
    validate_discount_change_type = fields.Selection([
        ('increase', 'Increase'),
        ('decrease', 'Decrease'),
        ('both', 'Both')
    ], string='Type of Validation Discount change', default='increase')
    validate_remove_line = fields.Boolean('Validate Remove Line')
    validate_return = fields.Boolean('Validate Return')
    validate_coupon = fields.Boolean('Validate Coupon (Gift Cards)')

    product_operation = fields.Boolean(
        'Product Operation', default=0,
        help='Allow cashiers add pos categories and products on pos screen')
    quickly_payment_full = fields.Boolean('Quickly Paid Full')
    quickly_payment_method_id = fields.Many2one(
        'pos.payment.method',
        string='Quickly Payment with Method')
    note_order = fields.Boolean('Note Order', default=0)
    signature_order = fields.Boolean('Signature Order', default=0)

    booking_orders = fields.Boolean(
        'Booking Orders',
        default=0,
        help='Orders may be come from many sources locations\n'
             'Example: Web E-Commerce, Call center, or phone call order\n'
             'And your Cashiers will made Booking Orders and save it\n'
             'Your Shipper or customer come shop will delivery Orders')
    load_booked_orders_type = fields.Selection([
        ('last_7_days', 'Last 7 Days'),
        ('last_1_month', 'Last 1 Month'),
        ('last_1_year', 'Last 1 Year (365 days)'),
        ('load_all', 'Load All'),
    ],
        default='last_7_days',
        string='Period days loading Booked Orders'
    )
    booking_orders_load_orders_another_pos = fields.Boolean(
        'Allow Load Order of another POS',
        default=1
    )
    booking_orders_alert = fields.Boolean(
        'Alert Order Coming', default=0,
        help='When have any Booking Order come from another Source Location to POS\n'
             'POS will Alert one popup inform your cashier have new Order coming')
    booking_allow_confirm_sale = fields.Boolean(
        'Delivery Booked Orders', default=0,
        help='Allow Cashier can Confirm Booked Orders and create Delivery Order')
    booking_orders_display_shipping_receipt = fields.Boolean('Shipping Address Receipt', default=0)
    display_tax_orderline = fields.Boolean('Display Taxes Order Line', default=0)
    display_tax_receipt = fields.Boolean('Display Taxes Receipt', default=0)
    display_image_orderline = fields.Boolean('Display Image on Order Lines', default=0)
    display_image_receipt = fields.Boolean('Display Image on Receipt', default=0)
    display_amount_discount = fields.Boolean('Display Amount Discount', default=1)
    display_barcode = fields.Boolean('Display Barcode', default=1)
    quickly_look_up_product = fields.Boolean(
        'Automatic Lookup Product',
        default=1,
        help='When you typing correct Barcode or Internal Reference or PLU Number on search box of POS Product Screen \n'
             'POS Searchbox automatic lookup product have Internal Ref or PLU number or Barcode or Name \n'
             'The same with your type, and automatic add Product to Cart'
    )
    category_wise_receipt = fields.Boolean(
        'Category Wise Receipt',
        default=0,
        help='Bill will wise each POS Category')
    management_invoice = fields.Boolean('Display Invoices Screen', default=0)
    load_invoices_type = fields.Selection([
        ('last_7_days', 'Last 7 Days'),
        ('last_1_month', 'Last 1 Month'),
        ('last_1_year', 'Last 1 Year (365 days)'),
        ('load_all', 'Load All'),
    ],
        default='last_7_days',
        string='Period days loading Invoices'
    )
    invoice_offline = fields.Boolean(
        'Invoice Offline Mode',
        help='Any Orders come from POS Session always create invoice \n'
             'Invoice will create few second after POS Orders created \n'
             'This future not print invoice number on POS Receipt \n'
             'Only create invoice each order and auto post invoice when POS Order submitted to backend \n'
             'Please set Customer Default or all orders on POS required set Customer before do payment'
    )
    wallet = fields.Boolean(
        'Wallet Card',
        help='Keeping all change money back to Customer Wallet Card\n'
             'Example: customer bought products with total amount is 9.5 USD\n'
             'Customer give your Cashier 10 USD, \n'
             'Default your cashier will return back change money 0.5 USD\n'
             'But Customer no want keep it, \n'
             'They need change money including to Wallet Card for next order\n'
             'Next Time customer come back, \n'
             'When your cashier choice client have Wallet Credit Amount bigger than 0\n'
             'Customer will have one more payment method via Wallet Credit')
    payment_journal_ids = fields.Many2many(
        'account.journal',
        'pos_config_invoice_journal_rel',
        'config_id',
        'journal_id',
        'Save Invoice Journal with this Journal',
        domain=[('type', '=', 'sale')],
        help="Default POS Odoo save Invoice Journal from only one Invoicing Journal of POS Config\n"
             "This future allow you add many Journals here\n"
             "And when your cashier choice Journal on POS\n"
             "Journal of Invoice will the same Journal selected by cashier")
    send_invoice_email = fields.Boolean(
        'Send email invoice',
        help='Help cashier send invoice to email of customer',
        default=0)
    customer_default_id = fields.Many2one(
        'res.partner',
        'Customer Default',
        help='This is customer automatic set to Order, \n'
             'When cashier create new order')
    auto_invoice = fields.Boolean(
        'Auto Order to Invoice',
        help='Auto check to button Invoice on POS Payment Screen',
        default=0)
    auto_invoice_with_customer_default = fields.Boolean(
        'Auto to Invoice if Customer default',
        help='Automatic Order to invoice if Customer Default',
        default=0
    )
    invoice_without_download = fields.Boolean(
        'Order to Invoice without Download',
        help='When cashier choose Invoice on Payment Screen \n'
             'POS will automatic made invoice for Order \n'
             'And blocked download Invoice Receipt Pdf'
    )
    display_full_customer_information = fields.Boolean(
        'Display full Customer Information on Receipt',
        help='If checked, Customer Email, Phone, Tin ...etc will display on Receipt', default=0)
    fiscal_position_auto_detect = fields.Boolean(
        'Fiscal position auto detect',
        default=0
    )
    display_sale_price_within_tax = fields.Boolean(
        'Display Sale Price Within Taxes',
        default=1
    )
    display_cost_price = fields.Boolean('Display Cost Price', default=0)
    display_product_ref = fields.Boolean('Display Product Ref', default=0)
    display_margin = fields.Boolean('Display Margin', default=0)
    display_product_second_name = fields.Boolean(
        'Display Product Second Name',
        default=1,
        help='If you need show Product Second Name on product record \n'
             'Active it for display second name on order cart and receipt/bill'
    )
    display_product_detail = fields.Boolean(
        'Display Product Detail',
        help='Display Product Detail and Purchased Histories of Customer',
        default=1
    )
    allow_remove_product = fields.Boolean(
        'Allow Remove Products',
        help='Allow cashier set Available in POS each Product to False'
    )
    allow_edit_product = fields.Boolean(
        'Allow Edit Product',
        help='Allow cashier edit Product (ex: Name, Category, Price ....)ừa'
    )
    hide_product_image = fields.Boolean('Hide Product Image', default=0)
    multi_location = fields.Boolean('Update Stock each Location', default=0)
    update_stock_onhand = fields.Boolean('Allow Update Stock On Hand', default=0)
    multi_stock_operation_type = fields.Boolean('Multi Stock Operation Type')
    multi_stock_operation_type_ids = fields.Many2many(
        'stock.picking.type',
        'config_stock_picking_type_rel',
        'config_id',
        'stock_picking_type_id',
        string='Operation Types',
        domain="[('warehouse_id.company_id', '=', company_id)]"
    )
    product_view = fields.Selection([
        ('box', 'Box View'),
        ('list', 'List View'),
    ], default='box', string='Product Screen View Type', required=1)
    product_image_size = fields.Selection([
        ('default', 'Default'),
        ('small', 'Small'),
        ('big', 'Big')
    ],
        default='big',
        string='Product Image Size')
    set_guest = fields.Boolean('Set Guests', default=0)
    set_guest_when_add_new_order = fields.Boolean(
        'Auto Ask Guests',
        help='When Cashiers add Orders, pos auto popup and ask guest name and guest number')
    update_tax = fields.Boolean(
        'Modify Taxes of Lines',
        default=0,
        help='Allow Cashiers can change Taxes of Lines')
    update_tax_ids = fields.Many2many(
        'account.tax',
        'pos_config_tax_rel',
        'config_id',
        'tax_id', string='List Taxes')
    review_receipt_before_paid = fields.Boolean(
        'Print Receipt Before Payment',
        help='Allow Print Receipt without Payment',
        default=1)
    print_last_order = fields.Boolean(
        'Print Last Receipt',
        default=0,
        help='Allow cashiers print last receipt')
    check_duplicate_email = fields.Boolean('Check duplicate email', default=0)
    check_duplicate_phone = fields.Boolean('Check duplicate phone', default=0)
    check_required_phone = fields.Boolean('Required Phone', default=0)
    check_required_email = fields.Boolean('Required Email', default=0)
    check_required_vat = fields.Boolean('Required Tax', default=0)
    manual_input_cart = fields.Boolean(
        'Manual Input Cart',
        help='Display Input box set \n'
             'Quantity, Discount, Price'
    )

    add_sale_person = fields.Boolean('Add Sale Person', default=0)
    default_seller_id = fields.Many2one(
        'res.users',
        'Default Seller',
        help='This is Seller Automatic assigned to new Orders and new Order Lines'
    )
    seller_ids = fields.Many2many(
        'res.users',
        'pos_config_sellers_rel',
        'config_id',
        'user_id',
        string='Sellers',
        help='This is list sellers use for choice and add to Order or Order Line')
    force_seller = fields.Boolean(
        'Force Seller',
        help='When Your POS session select/change another Seller \n'
             'POS auto assigned New Seller to each Line of Order Cart',
        default=0)
    logo = fields.Binary('Receipt Logo')
    payment_coin = fields.Boolean('Payment Coin')
    payment_coin_ids = fields.Many2many('pos.quickly.payment', string='Coins')
    backup_orders = fields.Text('Backup Orders', readonly=1)
    backup_orders_automatic = fields.Boolean(
        'Automatic BackUp Orders',
        help='Schedule 5 seconds, POS Session automatic backup Orders to BackEnd Odoo \n'
             'If POS Sessions Screen crashed, Computer PC Crashed or Browse Crashed ... could not open POS back \n'
             'Them can change to another PC, Devices and Open POS Session back \n'
             'Last Orders not Paid will automatic restore \n'
             'Nothing Unpaid Orders lost on POS Session \n'
             'Only Case will lost UnPaid Orders: POS Users turnoff Internet and them Remove Cache of Browse (**)\n'
             'With (**), we have not solution for covert It. Required Input Orders Unpaid Manual back'
    )
    save_orders_removed = fields.Boolean(
        'Save Orders Removed',
        default=1,
        help='If you active this feature \n'
             'Any orders remove buy cashier will save to backend \n'
             'Allow you monitor who, when cashier removed orders \n'
             'Allow cashier restore back order.'
    )
    management_session = fields.Boolean(
        'Manual Cash Control',
        default=0,
        help='Allow pos users can take money in/out session\n'
             'If you active this future please active Cash Control of POS Odoo Original too'
    )
    default_set_cash_open = fields.Boolean('Automatic Set Cash Open')
    default_set_cash_amount = fields.Float('Default Cash Open Amount')
    default_set_cash_notes = fields.Text('Default Cash Open Notes', default='Automatic Set Cash Open Notes')
    cash_inout_reason_ids = fields.Many2many(
        'product.product',
        'pos_config_cash_inout_product_rel',
        'config_id',
        'product_id',
        string='Cash In/Out Reason')
    barcode_receipt = fields.Boolean('Display Barcode (Ean13)', default=0)
    qrcode_receipt = fields.Boolean(
        'QrCode Link',
    )
    qrcode_ids = fields.One2many(
        'pos.qrcode',
        'config_id',
        string='Fields Display for Qrcode'
    )
    html_receipt_design = fields.Boolean('Design Header and Footer via HTML')
    html_header = fields.Text('Html Header of Receipt')
    html_footer = fields.Text('Html Footer of Receipt')
    receipt_title = fields.Char('Receipt Title', default='*** RECEIPT ***')
    receipt_font_size = fields.Integer(
        'Receipt Font Size (px)',
        default=22,
        help='Set range 18px to 24px'
    )
    receipt_template = fields.Selection([
        ('arabic', 'Arabic Receipt'),
        ('odoo_original', 'Odoo Original POS Receipt Template'),
        ('retail', 'POS Retail Receipt Template (included custom)'),
    ], default='odoo_original', string='Default POS Receipt Template', required=1)
    print_delivery_report = fields.Boolean(
        'Print Delivery Report',
        default=0,
        help='If you active it \n'
             'When Cashiers print POS Bill, POS auto print PDF Delivery Order Report'
    )
    print_order_report = fields.Boolean(
        'Print Order Report',
        default=0,
        help='If you active it \n'
             'When Cashiers print POS Bill, POS auto print PDF POS Order Report'
    )
    hide_mobile = fields.Boolean("Hide Client's Mobile", default=1)
    hide_phone = fields.Boolean("Hide Client's Phone", default=1)
    hide_email = fields.Boolean("Hide Client's Email", default=1)
    update_client = fields.Boolean(
        'Allow Update Clients',
        default=1,
        help='Uncheck if you dont want cashier change customer information on pos')
    add_client = fields.Boolean(
        'Allow Add Client',
        help='Allow POS Session can create new Client')
    archive_client = fields.Boolean(
        'Archive Client',
        default=0,
        help='Remove client out of POS, Customer set active is False \n'
             'Still saved at inside your database but not display in POS Clients Screen'
    )
    remove_client = fields.Boolean('Allow Remove Clients',
                                   help='Uncheck if you dont want cashier remove customers on pos')
    report_signature = fields.Boolean(string="Report Signature", default=0)

    report_product_summary = fields.Boolean(string="Report Product Summary", default=0)
    report_product_summary_auto_check_product = fields.Boolean('Auto Checked to Product Summary')
    report_product_summary_auto_check_category = fields.Boolean('Auto Checked to Product Category Summary')
    report_product_summary_auto_check_location = fields.Boolean('Auto Checked to Product Location Summary')
    report_product_summary_auto_check_payment = fields.Boolean('Auto Checked to Product Payment Summary')

    report_order_summary = fields.Boolean(string='Report Order Summary', default=0)
    report_order_summary_auto_check_order = fields.Boolean('Auto Checked to Order Summary')
    report_order_summary_auto_check_category = fields.Boolean('Auto Checked to Order Category Summary')
    report_order_summary_auto_check_payment = fields.Boolean('Auto Checked to Order Payment Summary')
    report_order_summary_default_state = fields.Selection([
        ('new', 'New'),
        ('paid', 'Paid'),
        ('posted', 'Posted'),
        ('invoiced', 'Invoiced'),
        ('all', 'All')
    ], string='Report with state', default='all')

    report_payment_summary = fields.Boolean(string="Report Payment Summary", default=0)
    report_sale_summary = fields.Boolean('Report Sale Summary (Z-Report)')
    report_sale_summary_show_profit = fields.Boolean('Report Sale Summary show Gross/Profit')
    default_product_sort_by = fields.Selection([
        ('a_z', 'Sort Name A to Z'),
        ('z_a', 'Sort Name Z to A'),
        ('low_price', 'Sort from Low to High Sale Price'),
        ('high_price', 'Sort from High to Low Sale Price'),
        ('pos_sequence', 'Product POS Sequence')
    ], string='Default Sort By', default='a_z')
    add_customer_before_products_already_in_shopping_cart = fields.Boolean(
        'Required choice Client before Add to Cart',
        help='Add customer before products \n'
             'already in shopping cart',
        default=0)
    allow_cashier_select_pricelist = fields.Boolean(
        'Allow Cashier select Pricelist',
        help='If uncheck, pricelist only work when select customer.\n'
             ' Cashiers could not manual choose pricelist',
        default=1)
    sale_with_package = fields.Boolean(
        'Sale with Package')
    allow_set_price_smaller_min_price = fields.Boolean(
        'Allow Cashier set Price smaller than Sale Price of Product',
        default=1)
    create_lots = fields.Boolean('Allow Create Lots/Serial', help='Allow cashier create Lots/Serials on pos')
    fullfill_lots = fields.Boolean('Auto fullfill Lot', default=1)
    promotion_ids = fields.Many2many(
        'pos.promotion',
        'pos_config_promotion_rel',
        'config_id',
        'promotion_id',
        string='Promotions Applied')
    pos_branch_id = fields.Many2one('pos.branch', 'Branch')

    stock_location_ids = fields.Many2many(
        'stock.location', string='Stock Locations',
        help='Stock Locations for cashier select checking stock on hand \n'
             'and made picking source location from location selected',
        domain=[('usage', '=', 'internal')])
    validate_by_manager = fields.Boolean('Validate by Managers')
    discount_unlock_by_manager = fields.Boolean('Unlock Limit Discount by Manager')
    manager_ids = fields.Many2many('res.users', 'pos_config_res_user_manager_rel', 'config_id', 'user_id',
                                   string='Manager Validation')
    stock_location_id = fields.Many2one('stock.location', string='POS Default Source Location',
                                        related='picking_type_id.default_location_src_id',
                                        readonly=1)
    stock_location_dest_id = fields.Many2one('stock.location', string='POS Default Dest Location',
                                             related='picking_type_id.default_location_dest_id',
                                             readonly=1)
    receipt_display_subtotal = fields.Boolean('Receipt Display Sub Total', default=1)
    receipt_display_taxes = fields.Boolean('Receipt Display Taxes', default=1)
    receipt_display_warehouse = fields.Boolean('Receipt Display Warehouse', default=1)
    receipt_header_style = fields.Selection([
        ('left', 'Left'),
        ('center', 'Center'),
        ('right', 'Right')
    ],
        default='center',
        string='Header Receipt Style',
        help='Header style, this future only apply on iotbox Odoo CE. \n'
             'Odoo EE not support. \n'
             'Not apply for printer direct web browse'
    )
    receipt_display_unit = fields.Boolean(
        'Receipt Display Unit of Measure',
        default=1
    )
    receipt_manual_download_invoice = fields.Boolean(
        'Receipt Manual Download Invoice',
        default=1
    )
    validate_order_without_receipt = fields.Boolean(
        'Validate Order without Print Receipt',
        help='Orders pushing to backend without Print Receipt \n'
             'Allow cashier full fill payment on Payment Screen \n'
             'When it Done, click Validate for next new Order, bypass Print Receipt step',
        default=0,
    )
    discount_value = fields.Boolean('Discount Value')
    discount_value_limit = fields.Float(
        'Discount Value Limit',
        help='This is maximum Amount Discount Cashier can set to each Line'
    )
    discount_global_id = fields.Many2one(
        'product.product',
        string='Discount Product Value',
        domain=[('available_in_pos', '=', True), ('sale_ok', '=', True)]
    )
    posbox_save_orders = fields.Boolean('Save Orders on PosBox')
    posbox_save_orders_iot_ids = fields.Many2many(
        'pos.iot',
        'pos_config_iot_save_orders_rel',
        'config_id',
        'iot_id',
        string='IoT Boxes for save Orders'
    )
    posbox_save_orders_server_ip = fields.Char(
        'Odoo Public Ip Address',
        help='Example Ip: 192.168.100.100'
    )
    posbox_save_orders_server_port = fields.Char(
        'Odoo Public Port Number',
        default='8069',
        help='Example Port: 8069'
    )
    analytic_account_id = fields.Many2one(
        'account.analytic.account',
        'Analytic Account'
    )
    limit_categories = fields.Boolean("Restrict Available Product Categories")
    iface_available_categ_ids = fields.Many2many(
        'pos.category',
        string='Available PoS Product Categories',
        help='The point of sale will only display products \n'
             'which are within one of the selected category trees. \n'
             'If no category is specified, all available products will be shown')
    barcode_scan_timeout = fields.Float(
        'Times timeout',
        default=1000,
        help='Period times timeout for next scan\n'
             '1000 = 1 second\n'
             'I good time for scan we think 1000'
    )
    rounding_automatic = fields.Boolean('Rounding Automatic',
                                        help='When cashier go to Payment Screen, POS auto rounding')
    rounding_type = fields.Selection([
        ('rounding_by_decimal_journal', 'By Decimal Rounding of Journal'),
        ('rounding_integer', 'Rounding to Integer'),
        ('rounding_up_down', 'Rounding Up and Down'),
    ],
        default='rounding_integer',
        help='1) * By Decimal Rounding of Payment Method [Rounding Amount]\n'
             '2) * Rounding to Integer: \n'
             '\n'
             'Rule 1: - From decimal from 0 to 0.25     become 0.0\n'
             'Rule 2: - From decimal from 0.25 to 0.75  become 0.5\n'
             'Rule 3: - From decimal from 0.75 to 0.999 become to 1 \n'
             '\n'
             '3) * Rounding up and down \n'
             'Rule 1: 0.1 to 0.4999 become 0.0 \n'
             'Rule 2: 0.5 to 0.9999 will  +1.0'
    )

    service_charge_ids = fields.Many2many(
        'pos.service.charge',
        'pos_config_service_charge_rel',
        'config_id',
        'charge_id',
        string='Services Charge on POS'
    )
    service_charge_type = fields.Selection(
        [
            ('tax_included', 'Taxes Included'),
            ('tax_excluded', 'Taxes Excluded')
        ]
        , default='tax_excluded'
        , string='Services Charge'
    )
    service_shipping_automatic = fields.Boolean(
        'Service Shipping Automatic',
        help='When cashier select Customer \n'
             'POS auto compute distance (km) from your Shop Stock Location to Partner Address \n'
             'And get distance for compute shipping cost, automatic add this cost to cart'
    )
    google_map_api_key = fields.Char('Google Map Api Key', invisible=True)
    payment_reference = fields.Boolean(
        'Payment Reference',
        help='Allow cashier add reference Note each payment line'
    )
    display_margin = fields.Boolean('Display Margin')
    allow_split_table = fields.Boolean('Allow Split Table')
    allow_merge_table = fields.Boolean('Merge/Combine Tables')
    allow_lock_table = fields.Boolean(
        'Lock Table',
        default=0,
        help='If Customer Booked Table, you can lock talbe \n'
             'Unlock by Pos Pass In of Managers Validation')
    required_set_guest = fields.Boolean(
        'Auto ask Guests when add new Order')
    start_session_oneclick = fields.Boolean(
        'Start Session One Click'
    )
    translate_products_name = fields.Boolean(
        'Load Translate Products Name',
        help='When active, all products name language will load correct language of language POS User started session',
        default=0
    )
    set_product_name_from_field = fields.Selection(
        _get_product_field_char,
        default='name',
        string='Product Name display by field',
        help="Choose the field of the table Product which will be used for Product Display"
    )
    replace_partners_name = fields.Boolean(
        'Replace Partners Name',
        help='When active, partners name will replace buy field you choose bellow',
        default=0
    )
    set_partner_name_from_field = fields.Selection(
        _get_customer_field_char,
        default='name',
        string='Customer Name display from field',
        help="Choose the field of the table Customer which will be used for Customer Display"
    )
    add_order_fields_to_receipt = fields.Many2many(
        'ir.model.fields',
        'pos_config_order_ir_model_fields_rel',
        'config_id',
        'field_id',
        domain=[
            ('model', '=', 'pos.order'),
            ('ttype', 'not in', ['binary', 'one2many', 'many2many'])
        ],
        string='Order fields Display',
        help='Fields added here will display on receipt'
    )
    add_picking_field_to_receipt = fields.Selection(
        _get_picking_field_char,
        default='name',
        string='Add Picking Field to Receipt',
        help="Please choose one field of Delivery Object\n"
             "Display to your POS receipt"
    )
    add_picking_fields_to_receipt = fields.Many2many(
        'ir.model.fields',
        'pos_config_picking_ir_model_fields_rel',
        'config_id',
        'field_id',
        domain=[
            ('model', '=', 'stock.picking'),
            ('ttype', 'not in', ['binary', 'one2many', 'many2many'])
        ],
        string='Delivery fields Display',
        help='Fields added here will display on receipt'
    )
    add_invoice_field_to_receipt = fields.Selection(
        _get_invoice_field_char,
        default='name',
        string='Add Invoice Field to Receipt',
        help="Please choose one field of Invoice Object\n"
             "for Display to your POS receipt"
    )
    add_invoices_field_to_receipt = fields.Many2many(
        'ir.model.fields',
        'pos_config_invoice_ir_model_fields_rel',
        'config_id',
        'field_id',
        domain=[
            ('model', '=', 'account.move'),
            ('ttype', 'not in', ['binary', 'one2many', 'many2many'])
        ],
        string='Invoice fields Display',
        help='Fields added here will display on receipt'
    )
    create_quotation = fields.Boolean(
        'Transfer Orders',
        help='Allow cashier create Quotation Order, \n'
             'And transfer Orders to another POS \n'
             'May your business have call center, you can active this feature'
    )
    assign_orders_to_config_ids = fields.Many2many(
        'pos.config',
        'pos_config_assign_orders_rel',
        'from_config_id',
        'assign_config_id',
        string='POS Received Orders'
    )
    display_logo = fields.Boolean(
        'Display Logo',
        default=1,
        help='If you uncheck, logo will not display on POS Receipt'
    )
    product_generic_option = fields.Boolean(
        'Product Generic Option',
        help='Generic product options. \n'
             'It should be possible to define certain product options that can be applied to any product \n'
             'Example: "Whipped cream" or "Extra hot".\n'
             'Generic product options may have an additional cost and materials list. \n'
             'If you active this option, please go to Retail Operation / Product Generic Option and add datas'
    )
    mrp = fields.Boolean(
        'Manufacturing',
        help='If each POS Line, cashier select assign BOM (Bill Of Material)\n'
             'When Cashier finish input BOM each POS Line \n'
             'Manufacturing Order will create and automatic processing \n'
    )
    last_save_cache = fields.Char('Last Save Cache', compute='_get_last_save_cache')
    display_sequence_number = fields.Boolean(
        'Display Sequence Number',
        default=True,
    )
    point_of_sale_update_stock_quantities = fields.Selection([
        ('closing', 'At the session closing (advised)'),
        ('real', 'In real time'),
    ],
        default='real',
        string="Update quantities in stock",
        required=1,
        help="At the session closing: A picking is created for the entire session when it's closed\n In real time: Each order sent to the server create its own picking")

    duplicate_receipt = fields.Boolean('Duplicate Receipt')
    duplicate_number = fields.Integer('Duplicate Number', default=2)
    save_receipt = fields.Boolean(
        'Save Receipt to backend',
        help='Allow you re-download, re-print receipt via backend'
    )
    multi_session = fields.Boolean(
        'Allow Multi Session',
        help='Each Employee will assign 1 POS Session \n'
             'Difference Employee is difference POS Session'
    )
    display_filter_product_categories = fields.Boolean(
        'Display Sale Product Category Filter',
        help='Allow Filter Products by Sale Products Category \n'
             'Like filter POS Category'
    )
    product_category_ids = fields.Many2many(
        'product.category',
        'pos_config_product_category_rel',
        'config_id',
        'category_id',
        string='Replace POS Categories by Sale Product Categories',
        help='If you select Sale Product Categories here \n'
             'All POS Categories will invisible \n'
             'POS Product Categories will replace by Sale Categories here'
    )
    sessions_opened = fields.Boolean(
        'Have Sessions Opened',
        compute='_check_has_sessions_not_closed'
    )
    search_query_only_start_when_enter = fields.Boolean(
        'Query Products when Enter Only',
        default=0,
        help='If you checked to this checkbox \n'
             'When you typing on Search Product box and required Press to Enter of your Keyboard \n'
             'POS will automatic search Product with value you typed \n'
             'If you not press to Enter, pos will not query Products'
    )
    create_category_direct = fields.Boolean('Create POS Category Direct')
    create_product_direct = fields.Boolean('Create Product Direct')
    customer_facing_screen = fields.Boolean('Customer Facing Screen', default=1)
    customer_facing_screen_width = fields.Integer('Width Customer Screen', default=1440)
    customer_facing_screen_height = fields.Integer('Height Customer Screen', default=900)
    rounding = fields.Boolean('Rounding')
    rounding_factor = fields.Float('Rounding Factor', default='1.0')
    decimal_places = fields.Integer('Decimal Places', default=0)

    font_family = fields.Char(
        'Font Family',
        default='"Montserrat", "Odoo Unicode Support Noto", sans-serif'
    )
    price_tag_color = fields.Char(
        'Price of Product Color',
        default='#FF5722',
        help='Price Color of Product'
    )
    header_background_color = fields.Char('Header Background App', default='#875A7B')
    cart_box_style = fields.Selection([
        ('left', 'Left of Page'),
        ('right', 'Right of Page')
    ], default='left', required=1, string='Cart position of Page')
    background = fields.Char(
        'Background of App',
        default='#ffffff',
        help='Background almost Screens of POS'
    )
    product_screen_background = fields.Char('Product Screen Background', default='#ffffff')
    cart_background = fields.Char('Cart Background', default='#ffffff')
    payment_screen_background = fields.Char('Payment Screen Background', default='#ffffff')
    numpad_background = fields.Char('Numpad Button Background', default='#ffffff')
    product_categories_height = fields.Integer(
        'Product Categories Height (%)',
        help='You can set from 0 to 100%',
        default=20
    )

    product_width = fields.Integer(
        'Product Width (em)',
        default=16,
        help='Default width of Product box is 18em',
        required=1
    )
    product_height = fields.Integer(
        'Product Height (em)',
        default=16,
        help='Default height of Product box is 18em',
        required=1)
    product_margin = fields.Float(
        'Product Margin (em)',
        default=0.1,
        help='Default Margin between Products Box',
        required=1)
    product_image_width = fields.Integer(
        'Product Image Width (%)',
        default=50,
        help="Width of Product's Image, set between 0 to 100"
    )
    product_image_height = fields.Integer(
        'Product Image Height (%)',
        default=50,
        help="Height of Product's Image, set between 0 to 100"
    )
    product_name_font_size = fields.Integer(
        'Product Name Font Size',
        default=18,
        help="Font Size of Product's Name, set between 13 to 20"
    )
    display_mobile_mode = fields.Boolean(
        'Change to Mobile Mode',
        help='If active it, when your pos resize screen \n'
             'POS Screen automatic change to Mobile Mode'
    )
    display_mobile_screen_size = fields.Integer(
        'Automatic change to Mobile mode with width of Page smaller than (px)',
        default=1200
    )
    display_product_image = fields.Selection([
        ('none', 'Not Display'),
        ('inline-block', 'Display')
    ],
        default='inline-block',
        required=1,
        string="Display Product's Image")
    cart_width = fields.Integer(
        'Cart List Width (%)',
        help='Width of Cart List, suggest is 45 (%)',
        default=45
    )
    whatsapp_api = fields.Char('WhatApp Api')
    whatsapp_token = fields.Char('WhatApp Token')
    whatsapp_send_type = fields.Selection([
        ('automatic', 'Automatic'),
        ('manual', 'Manual')
    ], string='WhatApp send Receipt Type', default='manual')
    whatsapp_message_receipt = fields.Text(
        'WhatsApp Message Receipt',
        default='Thank you for giving us the opportunity to serve you. This is your receipt'
    )

    allow_merge_lines = fields.Boolean(
        'Allow Merge Lines',
        help='If checked, allow automatic merge new line the same Product to line has submited to Kitchen Receipt'
    )
    checkin_screen = fields.Boolean(
        'CheckIn Screen',
        help='Customer easy Check In via Phone/Mobile \n'
             'If Client not register before, them easy register new'
    )

    hidden_product_ids = fields.Many2many(
        'product.product',
        'pos_config_product_hidden_rel',
        'pos_config_id',
        'product_id',
        string="Hidden Products",
        help='Hidden Products selected here out of POS Products Screen'
    )

    warning_closing_session = fields.Boolean(
        'Warning Closing Session',
        default=1,
        help='Warning Users when them close session \n'
             'With 2 reason bellow, we will warning POS Users when them closing a POS Screen \n'
             '1. If have orders draft, not full fill payment and submit to Odoo Server \n'
             '2. If Odoo server offline, and users close POS, could not open POS screen back\n'
             'Will Warning for users'
    )
    warning_odoo_offline = fields.Boolean(
        'Warning Odoo Offline',
        default=1,
        help='When POS User finish and Validate Order \n'
             'If POS counter have internet problem (offline) \n'
             'Or Your Odoo Offline \n'
             'POS Screen automatic warning POS Users before Validate the Order'
    )
    pos_title = fields.Char('POS Title', default='POS TL Technologies')
    show_all_payment_methods = fields.Boolean('Show All Payment Methods', default=0)
    sync_products_realtime = fields.Boolean(
        'Automatic Sync Realtime Products',
        default=0,
        help='If have any change Products from backend Odoo \n'
             'When you go to POS Products screen \n'
             'Automatic update and sync'
    )
    sync_partners_realtime = fields.Boolean(
        'Automatic Sync Realtime Customers',
        default=0,
        help='If have any change Customers from backend Odoo \n'
             'When you go to POS Customers screen \n'
             'Automatic update and sync'
    )
    cache = fields.Selection([
        ('none', 'None'),
        ('browse', 'Browse'),
        ('iot', 'IOT')
    ],
        default='none',
        string='Turbo Starting POS Screen',
        help='Noted: POS Config and POS Session never cache, it will refresh with POS Screen refresh \n'
             '1) none: Loading all pos datas direct Odoo Server \n'
             '2) browse: All pos datas will Cached to Users Browse \n'
             '3) iot: all pos datas will cached on iotbox (required iot or posbox)'
    )

    local_network_printer = fields.Boolean(
        "Enable IP Network Printing",
        default=False,
        help="If you enable network printing,\
                Printing via IoT Box will be given second priority")
    local_network_printer_ip_address = fields.Char('Printer IP Address', size=45)
    local_network_printer_port = fields.Integer('Printer IP Port', default='9100')
    product_recommendation = fields.Boolean(
        'Showing Product Recommendations on Product Screen',
        help='Example: Last times have some customers buy Product X and Product Y and Z \n'
             'Another customer go to buy product X or Y or Z, will suggest on Products Screen Product X,Y,Z (like may you like products ...)'
    )
    product_recommendation_number = fields.Integer(
        'Products Recommendations Number',
        help='Total Products Recommendations will display POS Screen',
        default=20,
    )
    show_session_information = fields.Boolean(
        'Show Session Information on POS header',
        help='Show Session Name, Opened Date and Sale Orders count of Session on header of POS Screen'
    )
    tip_percent = fields.Boolean(
        'Tip (%)',
        help='Allow cashier set Tip (%) base on Total Paid of Order'
    )
    tip_percent_max = fields.Float(
        'Tip Maximum (%) can set',
        default=10,
        help='Maximum (%) Tip can set [0 to 100%]'
    )

    categ_dislay_type = fields.Selection([
        ('filter', 'Filter by Parent Category Selected'),
        ('all', 'All Sub and Childs of Category Selected')
    ],
        default='all',
        string='Categories Display Type',
        help='Filter: If You selected Category A, only display Category A1, A2 ... child of Category A \n'
             'All: Always show All your POS Categories you have'
    )
    custom_sale = fields.Boolean('Custom Sale')
    custom_sale_product_id = fields.Many2one(
        'product.product',
        string='Custom Product',
        domain=[('available_in_pos', '=', True)]
    )

    # ----------- TODO: set pos link to our sub link -------------
    #
    def _get_pos_base_url(self):
        return '/pos/web'

    #
    # ----------- TODO: set pos link to our sub link -------------

    def send_message_via_whatsapp(self, pos_config_id, mobile_no, message):
        _logger.info('[send_message_via_whatsapp]: %s' % mobile_no)
        mobile_no = re.sub('[^0-9]', '', mobile_no)
        if not mobile_no:
            return False
        pos = self.sudo().browse(pos_config_id)
        endpoint = pos.whatsapp_api
        token = pos.whatsapp_token
        url = ''
        if all([endpoint, token]):
            url = f"{endpoint}/sendMessage?token={token}"
        else:
            ValidationError(_(f'Missing Whatsapp credentials, \ncontact to your Admin.'))
        if not url:
            return json.dumps("Missing Whatsapp configuration, contact to your Admin")
        headers = {
            'Content-Type': 'application/json',
        }
        payload = {
            'phone': mobile_no,
            'body': message,
        }
        try:
            req = requests.post(url, data=json.dumps(payload), headers=headers)
            response = req.json()
            if req.status_code == 201 or req.status_code == 200:
                _logger.info(
                    f"\n[send_message_via_whatsapp] Send Message successfully send to  phone number : {mobile_no}")
            else:
                if 'error' in response:
                    message = response['error']
                    _logger.error(f"[send_message_via_whatsapp] Reason: {req.reason}, Message:{message}")
            return response
        except Exception as e:
            _logger.error(e)
            return e

    def send_receipt_via_whatsapp(self, pos_config_id, ticket_img, mobile_no, message):
        _logger.info('[send_receipt_via_whatsapp]: %s' % mobile_no)
        mobile_no = re.sub('[^0-9]', '', mobile_no)
        if not mobile_no:
            return False
        if message:
            self.send_message_via_whatsapp(pos_config_id, mobile_no, message)
        pos = self.sudo().browse(pos_config_id)
        endpoint = pos.whatsapp_api
        token = pos.whatsapp_token
        url = ''
        if all([endpoint, token]):
            url = f"{endpoint}/sendFile?token={token}"
        else:
            ValidationError(_(f'Missing Whatsapp credentials, \ncontact to your Admin.'))
        if not url:
            return json.dumps("Missing Whatsapp configuration, contact to your Admin")
        headers = {
            'Content-Type': 'application/json',
        }
        payload = {
            'phone': mobile_no,
            'body': f"data:image/jpeg;base64,{ticket_img}",
            'filename': "POS-Receipt-%s.jpeg" % fields.Datetime.now()
        }
        try:
            req = requests.post(url, data=json.dumps(payload), headers=headers)
            response = req.json()
            if req.status_code == 201 or req.status_code == 200:
                _logger.info(
                    f"\n[send_receipt_via_whatsapp] Send Receipt successfully send to  phone number : {mobile_no}")
            else:
                if 'error' in response:
                    message = response['error']
                    _logger.error(f"[send_receipt_via_whatsapp] Reason: {req.reason}, Message:{message}")
            return response
        except Exception as e:
            _logger.error(e)
            return e

    def send_pdf_via_whatsapp(self, pos_config_id, file_name, report_ref, record_id, mobile_no, message):
        mobile_no = re.sub('[^0-9]', '', mobile_no)
        if not mobile_no:
            return False
        if message:
            self.send_message_via_whatsapp(pos_config_id, mobile_no, message)
        qr_pdf = self.env.ref(report_ref)._render_qweb_pdf(record_id)
        file = qr_pdf[0]
        qr_pdf = base64.b64encode(qr_pdf[0])
        pos = self.sudo().browse(pos_config_id)
        endpoint = pos.whatsapp_api
        token = pos.whatsapp_token
        url = ''
        if all([endpoint, token]):
            url = f"{endpoint}/sendFile?token={token}"
        else:
            ValidationError(_(f'Missing Whatsapp credentials, \ncontact to your Admin.'))
        if not url:
            return json.dumps("Missing Whatsapp configuration, contact to your Admin")
        headers = {
            'Content-Type': 'application/json',
        }
        payload = {
            'phone': mobile_no,
            'body': 'data:application/pdf;base64,' + str(qr_pdf)[2:-1],
            'filename': "%s-%s.pdf" % (file_name, fields.Datetime.now())
        }
        try:
            req = requests.post(url, data=json.dumps(payload), headers=headers)
            response = req.json()
            if req.status_code == 201 or req.status_code == 200:
                _logger.info(
                    f"\n[send_pdf_via_whatsapp] Send Receipt successfully send to  phone number : {mobile_no}")
            else:
                if 'error' in response:
                    message = response['error']
                    _logger.error(f"[send_pdf_via_whatsapp] Reason: {req.reason}, Message:{message}")
            return response
        except Exception as e:
            _logger.error(e)
            return e

    def revertToDefaultStyle(self):
        self.write({
            'background': '#ffffff',
            'price_tag_color': '#FF5722',
            'payment_screen_background': '#ffffff',
            'product_screen_background': '#ffffff',
            'cart_box_style': 'right',
            'product_width': 16,
            'product_height': 16,
            'product_margin': 0.1,
            'display_product_image': 'inline-block',
            'cart_width': 30,
            'cart_background': '#ffffff',
            'numpad_background': '#ffffff',
            'font_family': '"Montserrat", "Odoo Unicode Support Noto", sans-serif'
        })

    def _check_has_sessions_not_closed(self):
        for config in self:
            sessions = self.env['pos.session'].sudo().search([
                ('state', '!=', 'closed'),
                ('config_id', '=', config.id)
            ])
            if sessions:
                config.sessions_opened = True
            else:
                config.sessions_opened = False

    def _get_sync_with_sessions(self):
        for config in self:
            config.sync_multi_session_with = ''
            if config.sync_multi_session:
                for c in config.sync_to_pos_config_ids:
                    config.sync_multi_session_with += c.name + ' / '

    @api.onchange('allow_numpad')
    def onchange_allow_numpad(self):
        if not self.allow_numpad:
            self.allow_discount = False
            self.allow_qty = False
            self.allow_price = False
            self.allow_remove_line = False
            self.allow_minus = False
        else:
            self.allow_discount = True
            self.allow_qty = True
            self.allow_price = True
            self.allow_remove_line = True
            self.allow_minus = True

    def _get_last_save_cache(self):
        for config in self:
            log = self.env['pos.call.log'].search([], limit=1)
            if log:
                config.last_save_cache = log.write_date
            else:
                config.last_save_cache = 'Not Install Before'

    @api.onchange('sync_multi_session')
    def onchange_sync_multi_session(self):
        if not self.sync_multi_session:
            self.sync_multi_session_manual_stop = False

    def remove_sync_between_session_logs(self):
        for config in self:
            sessions = self.env['pos.session'].search([(
                'config_id', '=', config.id
            )])
        return True

    @api.onchange('discount')
    def onchange_discount(self):
        if self.discount:
            self.discount_limit_amount = 0
            self.discount_limit = False

    @api.onchange('multi_stock_operation_type')
    def onchange_multi_stock_operation_type(self):
        if not self.multi_stock_operation_type:
            self.multi_stock_operation_type_ids = [(6, 0, [])]

    def reinstall_database(self):
        ###########################################################################################################
        # new field append :
        #                    - update param
        #                    - remove logs datas
        #                    - remove cache
        #                    - reload pos
        #                    - reinstall pos data
        # reinstall data button:
        #                    - remove all param
        #                    - pos start save param
        #                    - pos reinstall with new param
        # refresh call logs:
        #                    - get fields domain from param
        #                    - refresh data with new fields and domain
        ###########################################################################################################
        parameters = self.env['ir.config_parameter'].sudo().search([
            ('key', 'in', [
                'product.product', 'res.partner',
                'account.move', 'account.move.line',
                'pos.order', 'pos.order.line',
                'sale.order', 'sale.order.line'
            ])])
        if parameters:
            parameters.sudo().unlink()
        self.env['pos.cache.database'].search([]).unlink()
        self.env['pos.call.log'].search([]).unlink()
        sessions_opened = self.env['pos.session'].sudo().search([('state', '=', 'opened')])
        sessions_opened.write({
            'required_reinstall_cache': True
        })
        for session in sessions_opened:
            self.env['bus.bus'].sendmany(
                [[(self.env.cr.dbname, 'pos.remote_sessions', session.user_id.id), json.dumps({
                    'remove_cache': True,
                    'database': self.env.cr.dbname,
                    'session_id': session.id
                })]])
        for config in self:
            sessions = self.env['pos.session'].sudo().search(
                [('config_id', '=', config.id), ('state', '=', 'opened')])
            if not sessions:
                return {
                    'type': 'ir.actions.act_url',
                    'url': '/pos/web?config_id=%d' % config.id,
                    'target': 'self',
                }
            sessions.write({'required_reinstall_cache': True})
            config_fw = config
            self.env['pos.session'].sudo().search(
                [('config_id', '!=', config.id), ('state', '=', 'opened')]).write({'required_reinstall_cache': True})
        return {
            'type': 'ir.actions.act_url',
            'url': '/pos/web?config_id=%d' % config_fw.id,
            'target': 'self',
        }

    def remote_sessions(self):
        return {
            'name': _('Remote sessions'),
            'view_type': 'form',
            'target': 'new',
            'view_mode': 'form',
            'res_model': 'pos.remote.session',
            'view_id': False,
            'type': 'ir.actions.act_window',
            'context': {},
        }

    def validate_and_post_entries_session(self):
        for config in self:
            sessions = self.env['pos.session'].search([
                ('config_id', '=', config.id),
                ('state', '!=', 'closed'),
                ('rescue', '=', False)
            ])
            if not sessions:
                sessions = self.env['pos.session'].search([
                    ('config_id', '=', config.id),
                    ('state', '!=', 'closed'),
                    ('rescue', '=', True)
                ])
            if sessions:
                for session in sessions:
                    if session.cash_control and abs(
                            session.cash_register_difference) > session.config_id.amount_authorized_diff:
                        return {
                            'name': _('Session'),
                            'view_mode': 'form,tree',
                            'res_model': 'pos.session',
                            'res_id': session.id,
                            'view_id': False,
                            'type': 'ir.actions.act_window',
                        }
                    else:
                        session.force_action_pos_session_close()
                    vals = {
                        'validate_and_post_entries': True,
                        'session_id': session.id,
                        'config_id': session.config_id.id,
                        'database': self.env.cr.dbname
                    }
                    self.env['bus.bus'].sendmany(
                        [[(self.env.cr.dbname, 'pos.remote_sessions', session.user_id.id), json.dumps(vals)]])
            else:
                raise UserError('Have not any Sessions need Close')
        return True

    def write(self, vals):
        if vals.get('allow_discount', False) or vals.get('allow_qty', False) or vals.get('allow_price', False):
            vals['allow_numpad'] = True
        if vals.get('expired_days_voucher', None) and vals.get('expired_days_voucher') < 0:
            raise UserError('Expired days of voucher could not smaller than 0')
            if config.pos_order_period_return_days <= 0:
                raise UserError('Period days return orders and products required bigger than or equal 0 day')
        res = super(PosConfig, self).write(vals)
        for config in self:
            if vals.get('management_session', False) and not vals.get('default_cashbox_id'):
                if not config.default_cashbox_id and not config.cash_control:
                    raise UserError(
                        'Your POS config missed config Default Opening (Cash Control), Please go to Cash control and set Default Opening')
        if vals.get('google_map_api_key', None):
            self.env['ir.config_parameter'].sudo().set_param('base_geolocalize.google_map_api_key',
                                                             vals.get('google_map_api_key', None))
        for c in self:
            sessions = self.env['pos.session'].search([
                ('config_id', '=', c.id),
                ('state', '=', 'opened')
            ])
            sessions.update_stock_at_closing = c.point_of_sale_update_stock_quantities == 'closing'
        return res

    def forceChangeUI(self):
        for config in self:
            sessions = self.env['pos.session'].search([
                ('config_id', '=', config.id),
                ('state', '=', 'opened')
            ])
            if sessions:
                config = self.search_read([
                    ('id', '=', config.id),
                ], [
                    'id',
                    'background',
                    'price_tag_color',
                    'cart_box_style',
                    'product_width',
                    'product_height',
                    'product_margin',
                    'cart_width',
                    'cart_background',
                    'font_family',
                    'display_product_image',
                    'payment_screen_background',
                ])[0]
                for s in sessions:
                    self.env['bus.bus'].sendmany(
                        [[(self.env.cr.dbname, 'pos.modifiers.background', s.user_id.id),
                          json.dumps(config)]])
        return True

    @api.model
    def create(self, vals):
        if vals.get('allow_discount', False) or vals.get('allow_qty', False) or vals.get('allow_price', False):
            vals['allow_numpad'] = True
        if vals.get('expired_days_voucher', 0) < 0:
            raise UserError('Expired days of voucher could not smaller than 0')
        config = super(PosConfig, self).create(vals)
        if config.pos_order_period_return_days <= 0:
            raise UserError('Period days return orders and products required bigger than or equal 0 day')
        if config.management_session and not config.default_cashbox_id and not config.cash_control:
            raise UserError(
                'Your POS config missed config Default Opening (Cash Control), Please go to Cash control and set Default Opening')
        if vals.get('google_map_api_key', None):
            self.env['ir.config_parameter'].sudo().set_param('base_geolocalize.google_map_api_key',
                                                             vals.get('google_map_api_key', None))
        return config

    @api.onchange('printer_id')
    @api.model
    def onchange_printer_id(self):
        if self.printer_id:
            self.is_posbox = True
            self.iface_print_via_proxy = True
            if not self.proxy_ip:
                warning = {
                    'title': _("Warning, input required !"),
                    'message': _('Please input IoT Box IP Address, it required')
                }
                return {'warning': warning}

    @api.onchange('cache')
    @api.model
    def onchange_cache(self):
        if ((self.cache == 'iot' and not self.is_posbox) or (self.cache == 'iot' and not self.proxy_ip)):
            warning = {
                'title': _("Warning, Input Required !"),
                'message': _('Please input IoT Box IP Address, it Required')
            }
            return {'warning': warning}

    @api.onchange('printer_ids')
    @api.model
    def onchange_printer_ids(self):
        if self.printer_ids:
            for printer in self.printer_ids:
                if printer.printer_type == 'network':
                    self.is_posbox = True
                    self.iface_print_via_proxy = True
                    if not self.proxy_ip:
                        warning = {
                            'title': _("Warning, input required !"),
                            'message': _('Please input IoT Box IP Address, it required')
                        }
                        return {'warning': warning}

    @api.onchange('allow_split_table')
    def _onchange_allow_split_table(self):
        if self.allow_split_table:
            self.iface_splitbill = True

    @api.onchange('is_posbox')
    def _onchange_is_posbox(self):
        super(PosConfig, self)._onchange_is_posbox()
        if not self.is_posbox:
            self.printer_id = False

    @api.model
    @api.onchange('management_session')
    def _onchange_management_session(self):
        self.cash_control = self.management_session

    def init_payment_method(self, journal_name, journal_sequence, journal_code, account_code, pos_method_type):
        Journal = self.env['account.journal'].sudo()
        Method = self.env['pos.payment.method'].sudo()
        IrModelData = self.env['ir.model.data'].sudo()
        IrSequence = self.env['ir.sequence'].sudo()
        Account = self.env['account.account'].sudo()
        user = self.env.user
        accounts = Account.search([
            ('code', '=', account_code), ('company_id', '=', self.company_id.id)])
        if accounts:
            accounts.sudo().write({'reconcile': True})
            account = accounts[0]
        else:
            account = Account.create({
                'name': journal_name,
                'code': account_code,
                'user_type_id': self.env.ref('account.data_account_type_current_assets').id,
                'company_id': self.company_id.id,
                'note': 'code "%s" auto give voucher histories of customers' % account_code,
                'reconcile': True
            })
            model_datas = IrModelData.search([
                ('name', '=', account_code + str(self.company_id.id)),
                ('module', '=', "pos_retail"),
                ('model', '=', 'account.account'),
                ('res_id', '=', account.id),
            ])
            if not model_datas:
                IrModelData.create({
                    'name': account_code + str(self.company_id.id),
                    'model': 'account.account',
                    'module': "pos_retail",
                    'res_id': account.id,
                    'noupdate': True,  # If it's False, target record (res_id) will be removed while module update
                })

        journals = Journal.search([
            ('code', '=', journal_code),
            ('company_id', '=', self.company_id.id),
        ])
        if journals:
            journals.sudo().write({
                'loss_account_id': account.id,
                'profit_account_id': account.id,
                'pos_method_type': pos_method_type,
                'sequence': journal_sequence,
            })
            journal = journals[0]
        else:
            new_sequence = IrSequence.create({
                'name': journal_name + str(self.company_id.id),
                'padding': 3,
                'prefix': account_code + str(self.company_id.id),
            })
            model_datas = IrModelData.search(
                [
                    ('name', '=', account_code + str(new_sequence.id)),
                    ('module', '=', "pos_retail"),
                    ('model', '=', 'ir.sequence'),
                    ('res_id', '=', new_sequence.id),
                ])
            if not model_datas:
                IrModelData.create({
                    'name': account_code + str(new_sequence.id),
                    'model': 'ir.sequence',
                    'module': "pos_retail",
                    'res_id': new_sequence.id,
                    'noupdate': True,
                })
            journal = Journal.create({
                'name': journal_name,
                'code': journal_code,
                'type': 'cash',
                'pos_method_type': pos_method_type,
                'company_id': self.company_id.id,
                'loss_account_id': account.id,
                'profit_account_id': account.id,
                'sequence': journal_sequence,
            })
            model_datas = IrModelData.search(
                [
                    ('name', '=', account_code + str(journal.id)),
                    ('module', '=', "pos_retail"),
                    ('model', '=', 'account.journal'),
                    ('res_id', '=', int(journal.id)),
                ])
            if not model_datas:
                IrModelData.create({
                    'name': account_code + str(journal.id),
                    'model': 'account.journal',
                    'module': "pos_retail",
                    'res_id': int(journal.id),
                    'noupdate': True,
                })
        methods = Method.search([
            ('name', '=', journal_name),
            ('company_id', '=', self.company_id.id)
        ])
        if not methods:
            method = Method.create({
                'name': journal_name,
                'receivable_account_id': account.id,
                'cash_journal_id': journal.id,
                'company_id': self.company_id.id,
            })
        else:
            method_ids = [method.id for method in methods]
            if len(method_ids) > 0:
                method_ids.append(0)
                self.env.cr.execute(
                    "UPDATE pos_payment_method SET is_cash_count=False where id in %s", (tuple(method_ids),))
            method = methods[0]
        for config in self:
            opened_session = config.mapped('session_ids').filtered(lambda s: s.state != 'closed')
            if not opened_session:
                payment_method_added_ids = [payment_method.id for payment_method in config.payment_method_ids]
                if method.id not in payment_method_added_ids:
                    payment_method_added_ids.append(method.id)
                    config.sudo().write({
                        'payment_method_ids': [(6, 0, payment_method_added_ids)],
                    })
        return True

    def open_ui(self):
        self.ensure_one()
        if not self.picking_type_id.default_location_src_id:
            raise UserError(
                'It not possible start POS Session if your POS Operation Type: %s not set Default Source Location' % self.picking_type_id.name)
        self.init_payment_method('Voucher', 100, 'JV', 'AJV', 'voucher')
        self.init_payment_method('Wallet', 101, 'JW', 'AJW', 'wallet')
        self.init_payment_method('Credit', 102, 'JC', 'AJC', 'credit')
        self.init_payment_method('Return Order', 103, 'JRO', 'AJRO', 'return')
        self.init_payment_method('Rounding Amount', 100, 'JRA', 'AJRA', 'rounding')
        return super(PosConfig, self).open_ui()

    def open_session_cb(self, check_coa=True):
        self.ensure_one()
        if not self.picking_type_id.default_location_src_id:
            raise UserError(
                'It not possible start POS Session if your POS Operation Type: %s not set Default Source Location' % self.picking_type_id.name)
        self.init_payment_method('Voucher', 100, 'JV', 'AJV', 'voucher')
        self.init_payment_method('Wallet', 101, 'JW', 'AJW', 'wallet')
        self.init_payment_method('Credit', 102, 'JC', 'AJC', 'credit')
        self.init_payment_method('Return Order', 103, 'JRO', 'AJRO', 'return')
        self.init_payment_method('Rounding Amount', 100, 'JRA', 'AJRA', 'rounding')
        return super(PosConfig, self).open_session_cb(check_coa)

    def get_voucher_number(self, config_id):
        config = self.browse(config_id)
        if not config.voucher_sequence_id:
            raise UserError(
                u'Your POS Config not setting Voucher Sequence, please contact your POS Manager setting it before try this feature')
        else:
            return config.voucher_sequence_id._next()

    # TODO: for supported multi pricelist difference currency
    @api.constrains('pricelist_id', 'use_pricelist', 'available_pricelist_ids', 'journal_id', 'invoice_journal_id',
                    'payment_method_ids')
    def _check_currencies(self):
        return True
        # for config in self:
        #     if config.use_pricelist and config.pricelist_id not in config.available_pricelist_ids:
        #         raise ValidationError(_("The default pricelist must be included in the available pricelists."))
        # if self.invoice_journal_id.currency_id and self.invoice_journal_id.currency_id != self.currency_id:
        #     raise ValidationError(_(
        #         "The invoice journal must be in the same currency as the Sales Journal or the company currency if that is not set."))
        # if any(
        #         self.payment_method_ids \
        #                 .filtered(lambda pm: pm.is_cash_count) \
        #                 .mapped(
        #             lambda pm: self.currency_id not in (self.company_id.currency_id | pm.cash_journal_id.currency_id))
        # ):
        #     raise ValidationError(_(
        #         "All payment methods must be in the same currency as the Sales Journal or the company currency if that is not set."))

    def new_rate(self, from_amount, to_currency):
        pricelist_currency = self.env['res.currency'].browse(to_currency)
        company_currency = self.company_id.currency_id
        new_rate = company_currency._convert(from_amount, pricelist_currency,
                                             self.company_id or self.env.user.company_id, fields.Date.today())
        return new_rate

    def _open_session(self, session_id):
        session_form = super(PosConfig, self)._open_session(session_id)
        session = self.env['pos.session'].browse(session_id)
        if session.config_id.start_session_oneclick and session.state != 'opened':
            session.action_pos_session_open()
            return session.open_frontend_cb()
        else:
            return session_form
