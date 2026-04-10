import sys
print('1')
import os
print('2')
from sqlalchemy import create_engine
print('3')
from sqlalchemy.orm import declarative_base, sessionmaker
print('4')
from dotenv import load_dotenv
print('5')
load_dotenv()
print('6')
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./dialora.db')
print('7')
connect_args = {'check_same_thread': False}
print('8')
engine = create_engine(DATABASE_URL, connect_args=connect_args)
print('9')
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
print('10')
Base = declarative_base()
print('11 Done!')
