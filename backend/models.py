from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    business_context = Column(Text, nullable=True)
    script = Column(Text, nullable=True)
    knowledge_base = Column(Text, nullable=True)
    language = Column(String(50), default="en-IN")
    status = Column(String(50), default="draft") # draft, active, finished
    created_at = Column(DateTime, default=datetime.utcnow)

    contacts = relationship("Contact", back_populates="campaign", cascade="all, delete-orphan")
    call_logs = relationship("CallLog", back_populates="campaign", cascade="all, delete-orphan")

class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"))
    name = Column(String(255), nullable=False)
    phone_number = Column(String(50), nullable=False)
    status = Column(String(50), default="pending") # pending, called, retry, done
    retry_count = Column(Integer, default=0)

    campaign = relationship("Campaign", back_populates="contacts")
    call_logs = relationship("CallLog", back_populates="contact")

class CallLog(Base):
    __tablename__ = "call_logs"

    id = Column(Integer, primary_key=True, index=True)
    contact_id = Column(Integer, ForeignKey("contacts.id"))
    campaign_id = Column(Integer, ForeignKey("campaigns.id"))
    call_sid = Column(String(255), index=True) # Twilio Call SID
    transcript = Column(Text, nullable=True) # JSON array of turns
    intent_tag = Column(String(100), nullable=True) # interested, not_interested, callback, no_answer, etc.
    lead_score = Column(Integer, nullable=True) # 0-10
    summary = Column(Text, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    recording_url = Column(String(500), nullable=True)
    status = Column(String(50), nullable=True) # e.g. completed, busy, no-answer
    created_at = Column(DateTime, default=datetime.utcnow)

    contact = relationship("Contact", back_populates="call_logs")
    campaign = relationship("Campaign", back_populates="call_logs")
