# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from datetime import datetime
import logging
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    pos_combo_item_ids = fields.One2many('pos.combo.item', 'product_combo_id', string='Combo Items')
    is_combo = fields.Boolean(
        'Combo Bundle/Pack',
        help='Active it and see to tab Combo/Pack and adding Items for Combo Future'
    )
    is_combo_item = fields.Boolean(
        'Dynamic Combo Item',
        help='Allow this product become item combo of Another Product'
    )
    combo_limit = fields.Integer(
        'Combo Item Limit',
        help='Limit combo items can allow cashier add / combo')
    is_credit = fields.Boolean('Is Credit', default=False)
    multi_category = fields.Boolean('Multi Category')
    pos_categ_ids = fields.Many2many(
        'pos.category',
        string='POS Multi Category')
    multi_uom = fields.Boolean('Multi Unit')
    price_uom_ids = fields.One2many(
        'product.uom.price',
        'product_tmpl_id',
        string='Price by Sale Unit')
    multi_variant = fields.Boolean('Multi Variant and Attribute')
    pos_variant_ids = fields.One2many(
        'product.variant',
        'product_tmpl_id',
        string='Variants and Attributes of Product')
    cross_selling = fields.Boolean('Cross Selling')
    cross_ids = fields.One2many(
        'product.cross',
        'product_tmpl_id',
        string='Cross Selling Items')
    supplier_barcode = fields.Char(
        'Supplier Barcode', copy=False,
        help="Supplier Barcode Product, You can Input here and scan on POS")
    barcode_ids = fields.One2many(
        'product.barcode',
        'product_tmpl_id',
        string='Multi Barcode')
    pos_sequence = fields.Integer('POS Sequence')
    is_voucher = fields.Boolean('Is Voucher/Coupon', default=0)
    sale_with_package = fields.Boolean('Sale with Package')
    pizza_modifier = fields.Boolean('Pizza Modifier')
    price_unit_each_qty = fields.Boolean('Active Sale Price each Quantity')
    product_price_quantity_ids = fields.One2many(
        'product.price.quantity',
        'product_tmpl_id',
        'Price each Quantity')
    qty_warning_out_stock = fields.Float('Qty Warning out of Stock', default=10)
    combo_price = fields.Float(
        'Combo Item Price',
        help='This Price will replace public price and include to Line in Cart'
    )
    combo_limit_ids = fields.One2many(
        'pos.combo.limit',
        'product_tmpl_id',
        'Combo Limited Items by Category'
    )
    name_second = fields.Char(
        'Second Name',
        help='If you need print pos receipt Arabic,Chinese...language\n'
             'Input your language here, and go to pos active Second Language')
    special_name = fields.Char('Special Name')
    uom_ids = fields.Many2many('uom.uom', string='Units the same category', compute='_get_uoms_the_same_category')
    note_ids = fields.Many2many(
        'pos.note',
        'product_template_note_rel',
        'product_tmpl_id',
        'note_id',
        string='Notes Fixed'
    )
    tag_ids = fields.Many2many(
        'pos.tag',
        'product_template_tag_rel',
        'product_tmpl_id',
        'tag_id',
        string='Tags'
    )
    pos_branch_id = fields.Many2one('pos.branch', string='Branch')
    commission_rate = fields.Float(
        'Commission Rate',
        default=50,
        help='Commission Rate (%) for sellers'
    )
    cycle = fields.Integer(
        'Cycle',
        help='Total cycle times, customer can use in Spa Business'
    )
    addon_id = fields.Many2one(
        'product.addons',
        string='Addon',
    )
    discountable = fields.Boolean(
        'Discountable',
        default=True,
        help='If it checked, not allow POS Cashier set Discount'
    )
    refundable = fields.Boolean(
        'Refundable',
        default=True,
        help='If it checked, not allow POS Cashier refund Product'
    )
    open_price = fields.Boolean(
        'Open Price Item',
        help='If it checked, when Cashier add to cart, auto ask price of this Product'
    )
    product_brand_id = fields.Many2one('pos.product.brand', 'Brand')

    def add_barcode(self):
        newCode = None
        for product in self:
            format_code = "%s%s%s" % ('777', product.id, datetime.now().strftime("%d%m%y%H%M"))
            barcode = self.env['barcode.nomenclature'].sanitize_ean(format_code)
            product.write({'barcode': barcode})
            newCode = barcode
        return newCode

    def random_barcode(self):
        for product in self:
            format_code = "%s%s%s" % ('333', product.id, datetime.now().strftime("%d%m%y%H%M"))
            barcode = self.env['barcode.nomenclature'].sanitize_ean(format_code)
            product.write({'supplier_barcode': barcode})
        return True

    @api.model
    def create(self, vals):
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        product_tmpl = super(ProductTemplate, self).create(vals)
        products = self.env['product.product'].search([('product_tmpl_id', '=', product_tmpl.id)])
        if len(products) > 0:
            products.write_date = product_tmpl.write_date
            self.env['pos.cache.database'].syncToPosOnline('product.product', [p.id for p in products])
        return product_tmpl

    @api.onchange('uom_id')
    def onchange_uom_id(self):
        if self.uom_id:
            uoms = self.env['uom.uom'].search([('category_id', '=', self.uom_id.category_id.id)])
            self.uom_ids = [(6, 0, [uom.id for uom in uoms])]

    def _get_uoms_the_same_category(self):
        for product in self:
            uoms = self.env['uom.uom'].search([('category_id', '=', product.uom_id.category_id.id)])
            product.uom_ids = [(6, 0, [uom.id for uom in uoms])]

    def write(self, vals):
        res = super(ProductTemplate, self).write(vals)
        for product_temp in self:
            product_ids = []
            products = self.env['product.product'].search([('product_tmpl_id', '=', product_temp.id)])
            for product in products:
                product_ids.append(product.id)
                product.write_date = product_temp.write_date
            self.env['pos.cache.database'].syncToPosOnline('product.product', product_ids)
        return res

    def unlink(self):
        for product_temp in self:
            product_ids = []
            products = self.env['product.product'].search([('product_tmpl_id', '=', product_temp.id)])
            for product in products:
                product_ids.append(product.id)
            self.env['pos.cache.database'].syncToPosOnline('product.product', product_ids)
        return super(ProductTemplate, self).unlink()



class ProductProduct(models.Model):
    _inherit = 'product.product'

    college_id = fields.Many2one('product.college', 'College')
    model_id = fields.Many2one('product.model', 'Model')
    sex_id = fields.Many2one('product.sex', 'Sex')
    plu_number = fields.Char('PLU Number')

    def force_write(self, vals):
        self.sudo().write(vals)
        return True


    def unlink(self):
        product_ids = []
        for product in self:
            product_ids.append(product.id)
            if product.product_tmpl_id and product.product_tmpl_id.available_in_pos:
                linesHavePurchased = self.env['pos.order.line'].search([('product_id', '=', product.id)])
                if linesHavePurchased:
                    raise UserError(
                        _('You cannot delete a product . Because products have exsting in POS Order Lines'))
        res = super(ProductProduct, self).unlink()
        self.env['pos.cache.database'].syncToPosOnline('product.product', product_ids)
        return res

    def add_barcode(self):
        newCode = None
        for product in self:
            format_code = "%s%s%s" % ('777', product.id, datetime.now().strftime("%d%m%y%H%M"))
            barcode = self.env['barcode.nomenclature'].sanitize_ean(format_code)
            product.write({'barcode': barcode})
            newCode = barcode
        return newCode

    def write(self, vals):
        product_ids = []
        res = super(ProductProduct, self).write(vals)
        for product in self:
            product_ids.append(product.id)
        self.env['pos.cache.database'].syncToPosOnline('product.product', product_ids)
        return res

    @api.model
    def create(self, vals):
        product = super(ProductProduct, self).create(vals)
        self.env['pos.cache.database'].syncToPosOnline('product.product', [product.id])
        return product