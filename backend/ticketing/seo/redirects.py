from django.shortcuts import redirect


def build_redirect_response(resolve_result):
    """
    Build a Django redirect response from a ProductURLResolveResult.

    Usage:

        result = resolve_public_product_url(...)

        if result.should_redirect:
            return build_redirect_response(result)
    """

    if not resolve_result or not resolve_result.should_redirect:
        return None

    permanent = int(resolve_result.redirect_type or 301) == 301

    return redirect(resolve_result.redirect_path, permanent=permanent)


def redirect_payload(resolve_result):
    """
    Useful for APIs/debugging when we want JSON instead of HTTP redirect.
    """

    if not resolve_result:
        return {
            "should_redirect": False,
            "redirect_path": "",
            "redirect_type": 301,
        }

    return {
        "should_redirect": resolve_result.should_redirect,
        "redirect_path": resolve_result.redirect_path,
        "redirect_type": resolve_result.redirect_type or 301,
        "resolved_by": resolve_result.resolved_by,
    }