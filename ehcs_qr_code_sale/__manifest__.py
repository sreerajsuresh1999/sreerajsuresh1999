# -*- coding: utf-8 -*-
{
    'name': 'QR Code Sale',
    'version': '11.0.1.0.0',
    'category': 'Base',
    'author': 'ERP Harbor Consulting Services',
    'summary': 'Generate QR Code for Sale',
    'website': 'http://www.erpharbor.com',
    'description': """""",
    'depends': [
        'ehcs_qr_code_base',
        'sale_management',
    ],
    'data': [
        'report/sale_order_report_template.xml',
        'views/qr_code_sale_view.xml',
    ],
    'images': [
        'static/description/banner.png',
    ],
    'installable': True,
}
