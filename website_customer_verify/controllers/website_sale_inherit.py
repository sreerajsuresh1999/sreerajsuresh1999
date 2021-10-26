from odoo.exceptions import UserError, ValidationError,Warning
from odoo import http
from odoo.http import request
from odoo.addons.website_sale.controllers.main import WebsiteSale

class WebsiteSale_inherit(WebsiteSale):

    @http.route(['/shop/checkout'], type='http', auth="public", website=True, sitemap=False)
    def checkout(self, **post):
        res = super(WebsiteSale_inherit, self).checkout(type='http', auth="public", website=True, sitemap=False)
        print("insise new controller")
        order = request.website.sale_get_order().name
        print(order)
        #raise Warning('Entered Quantity is greater than quantity on source.')
        #return request.render("website_sale.cart")