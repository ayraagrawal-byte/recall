def expand_query(query: str):
    expanded = query
    query_lower = query.lower()

    # Questions about participants / samples
    participant_terms = [
        "participant",
        "participants",
        "children",
        "infants",
        "sample",
        "age range",
        "included",
    ]

    if any(term in query_lower for term in participant_terms):
        expanded += " participants sample methods"

    # Questions about results / findings
    result_terms = [
        "result",
        "results",
        "effect",
        "difference",
        "relationship",
        "predict",
        "significant",
    ]

    if any(term in query_lower for term in result_terms):
        expanded += " results findings significant"

    # Questions about methods / procedures
    method_terms = [
        "method",
        "task",
        "procedure",
        "condition",
        "measure",
        "assessment",
    ]

    if any(term in query_lower for term in method_terms):
        expanded += " methods procedure task"

    return expanded