import sys
with open('main.py', 'r') as f:
    text = f.read()

patch = """
    try:
        from twilio.twiml.voice_response import VoiceResponse, Gather
        form = await request.form()
        call_sid = form.get("CallSid")
        campaign_id = request.query_params.get("campaign_id")
"""
original = """
    from twilio.twiml.voice_response import VoiceResponse, Gather
    form = await request.form()
    call_sid = form.get("CallSid")
    campaign_id = request.query_params.get("campaign_id")
"""
text = text.replace(original, patch)

patch2 = """
    response.append(gather)
    return Response(content=str(response), media_type="application/xml")
    except Exception as e:
        import traceback
        return Response(content=traceback.format_exc(), status_code=500)
"""
original2 = """
    response.append(gather)
    return Response(content=str(response), media_type="application/xml")
"""
text = text.replace(original2, patch2)

with open('main.py', 'w') as f:
    f.write(text)
