odoo.define('pos_retail.PopUpReportProductsSummary', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const {useExternalListener} = owl.hooks;

    class PopUpReportProductsSummary extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                current_session_report: this.props.current_session_report || false,
                from_date: this.props.from_date,
                to_date: this.props.to_date,
                report_product_summary_auto_check_product: this.props.report_product_summary_auto_check_product,
                report_product_summary_auto_check_category: this.props.report_product_summary_auto_check_category,
                report_product_summary_auto_check_location: this.props.report_product_summary_auto_check_location,
                report_product_summary_auto_check_payment: this.props.report_product_summary_auto_check_payment,
            }
            this.state = useState(this.changes);
            this.orderUiState = useContext(contexts.orderManagement);
            useExternalListener(window, 'keyup', this._keyUp);
        }

        _keyUp(event) {
            if (event.key == 'Enter') {
                this.confirm()
            }
        }

        get isHidden() {
            return this.state.current_session_report;
        }

        OnChange(event) {
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            } else {
                this.changes[event.target.name] = event.target.value;
            }
            this.props.current_session_report = this.changes.current_session_report;
            this.render()
        }

        getPayload() {
            if (this.orderUiState.isSuccessful) {
                return {
                    values: this.changes
                };
            } else {
                return {
                    values: this.changes,
                    error: this.orderUiState.hasNotice
                };
            }

        }
    }

    PopUpReportProductsSummary.template = 'PopUpReportProductsSummary';
    PopUpReportProductsSummary.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpReportProductsSummary);

    return PopUpReportProductsSummary
});
