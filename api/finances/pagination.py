from common.pagination import StandardResultsSetPagination

MONEY_SCHEMA = {"type": "string", "format": "decimal", "pattern": r"^-?\d{0,10}(?:\.\d{0,2})?$"}
TOTAL_FIELDS = ("total_incomes", "total_expenses", "total_transfers", "total")


class TransactionPagination(StandardResultsSetPagination):
    """
    Adds the totals of ALL transactions matching the filters (not just this page) to the response;
    TransactionViewSet.list puts them in. Strings, like every other amount in the API.
    """

    def get_paginated_response_schema(self, schema):
        response_schema = super().get_paginated_response_schema(schema)
        for field in TOTAL_FIELDS:
            response_schema["properties"][field] = MONEY_SCHEMA
        response_schema["required"] = [*response_schema["required"], *TOTAL_FIELDS]
        return response_schema
