def get_active_membership(user):
    return (
        user.memberships
        .filter(is_active=True, organisation__is_active=True)
        .select_related("organisation")
        .first()
    )


def get_user_role(user):
    membership = get_active_membership(user)
    return membership.role if membership else None


def is_management(user):
    return user.is_superuser or get_user_role(user) in [
        "owner",
        "director",
        "manager",
    ]


def is_facilitator(user):
    return get_user_role(user) == "facilitator"


def get_facilitator_profile(user):
    if not hasattr(user, "employee_profile"):
        return None

    return getattr(user.employee_profile, "facilitator_profile", None)