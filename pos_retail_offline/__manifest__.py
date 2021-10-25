# -*- coding: utf-8 -*
# This Source Codes created by TL Technology (thanhchatvn@gmail.com)
# Not allow resale, editing source codes
# License: Odoo Proprietary License v1.0
{
    'name': "POS Offline Mode",
    'version': '1.0.0.1',
    'category': 'Point of Sale',
    'author': 'TL Technology',
    "summary":
        """
        Point Of Sale Offline Mode\n
        Allow Sale Products, create Orders without Internet and Odoo Server \n
        Allow Reload, Refresh POS Page  without Internet and Odoo Server\n\
        """,
    "description":
        """
        Point Of Sale Offline Mode\n
        Allow Sale Products, create Order without Internet and Odoo Server \n
        Allow Reload, Refresh POS Page  without Internet and Odoo Server\n\
        """,
    "live_test_url": 'https://www.youtube.com/watch?v=c36bytTuZXw',
    "website": 'http://posodoo.com',
    'price': '2500',
    'sequence': 0,
    'depends': [
        'point_of_sale',
        'pos_hr',
        'pos_restaurant',
    ],
    'demo': [],
    'data': [
        'import_libraries.xml'
    ],
    'qweb': [
        'static/src/xml/*.xml'
    ],
    "currency": 'EUR',
    'installable': True,
    'application': True,
    'images': ['static/description/icon.png'],
    'support': 'thanhchatvn@gmail.com',
    'license': 'OPL-1',
}
