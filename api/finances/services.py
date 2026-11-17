"""Finance helpers used outside the finances views."""

from finances.models import Category, CategoryGroup

# Starting categories for a new personal household (group -> categories). The user renames,
# switches off or deletes them later through the API; nothing depends on these names.
DEFAULT_CATEGORIES = {
    "Prihodi": ["Plata", "Ostali prihodi"],
    "Stanovanje": ["Kirija", "Režije", "Internet i telefon"],
    "Hrana": ["Namirnice", "Restorani i dostava"],
    "Prevoz": ["Gorivo", "Javni prevoz", "Taksi"],
    "Zdravlje": ["Lekovi", "Lekari", "Sport"],
    "Lično": ["Odeća i obuća", "Nega", "Zabava", "Pokloni"],
    "Ostalo": ["Ostali troškovi"],
}


def create_default_categories(household):
    """Create DEFAULT_CATEGORIES in `household`; meant for a brand new, empty household."""
    for group_name, category_names in DEFAULT_CATEGORIES.items():
        group = CategoryGroup.objects.create(household=household, name=group_name)
        Category.objects.bulk_create(
            Category(household=household, category_group=group, name=name)
            for name in category_names
        )
