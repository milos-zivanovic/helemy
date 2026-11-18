from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class PageInfoPagination(PageNumberPagination):
    """Page number pagination that also returns `total_pages` and `current_page`."""

    def get_paginated_response(self, data):
        return Response(
            {
                "count": self.page.paginator.count,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "total_pages": self.page.paginator.num_pages,
                "current_page": self.page.number,
                "results": data,
            }
        )

    def get_paginated_response_schema(self, schema):
        response_schema = super().get_paginated_response_schema(schema)
        response_schema["properties"]["total_pages"] = {"type": "integer", "example": 3}
        response_schema["properties"]["current_page"] = {"type": "integer", "example": 1}
        response_schema["required"] = [*response_schema["required"], "total_pages", "current_page"]
        return response_schema


class StandardResultsSetPagination(PageInfoPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 100


class SmallResultsSetPagination(PageInfoPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 50
