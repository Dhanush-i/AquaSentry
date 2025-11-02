import tweepy
import datetime
import spacy
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderUnavailable
import time
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from app import app, db, Report

BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAALIn4wEAAAAA%2FxYtPkgm85mBlav3JQgMNDdrD94%3DJTYjSoKDitfq3e5hctNdBV1a6yV4EawiFvETtNVBzGaYZZgsRN" 

print("Loading NLP model (en_core_web_sm)...")
nlp = spacy.load("en_core_web_sm")
print("NLP model loaded.")

print("Loading Sentiment Analyzer (VADER)...")
sentiment_analyzer = SentimentIntensityAnalyzer()
print("Sentiment Analyzer loaded.")

geolocator = Nominatim(user_agent="aquasentry_app_v1")

INDIA_BOUNDS = {
    "min_lat": 5.9,
    "max_lat": 35.5,
    "min_lon": 68.1,
    "max_lon": 97.4
}

DEFAULT_LOCATION = {
    "latitude": 28.6139,
    "longitude": 77.2090
}

def is_location_in_india(lat, lon):
    return (INDIA_BOUNDS["min_lat"] <= lat <= INDIA_BOUNDS["max_lat"]) and \
           (INDIA_BOUNDS["min_lon"] <= lon <= INDIA_BOUNDS["max_lon"])

def get_sentiment(text):
    score = sentiment_analyzer.polarity_scores(text)['compound']
    if score >= 0.05:
        return 'positive'
    elif score <= -0.05:
        return 'negative'
    else:
        return 'neutral'

def extract_location(text):
    doc = nlp(text)
    
    for ent in doc.ents:
        if ent.label_ == "GPE": 
            location_name = ent.text
            print(f"  -> Found potential location: {location_name}")
            try:
                location_data = geolocator.geocode(location_name, timeout=5)
                
                if location_data:
                    if is_location_in_india(location_data.latitude, location_data.longitude):
                        print(f"  -> Geocoded '{location_name}' to: ({location_data.latitude}, {location_data.longitude}) - INSIDE India.")
                        return (location_data.latitude, location_data.longitude)
                    else:
                        print(f"  -> Location '{location_name}' ({location_data.latitude}, {location_data.longitude}) is outside India. Discarding.")
                else:
                    print(f"  -> Could not geocode: {location_name}")
                
                time.sleep(1) 
                
            except (GeocoderTimedOut, GeocoderUnavailable):
                print("  -> Geocoding service timed out. Skipping.")
                time.sleep(1) 
                continue
                
    return None

def save_tweet_as_report(tweet_text):
    print(f"\nAnalyzing tweet: {tweet_text[:50]}...")
    
    coords = extract_location(tweet_text)
    sentiment = get_sentiment(tweet_text)
    print(f"  -> Sentiment: {sentiment.upper()}")
    
    latitude = DEFAULT_LOCATION["latitude"]
    longitude = DEFAULT_LOCATION["longitude"]
    
    if coords:
        latitude, longitude = coords
    else:
        print("  -> No valid India location found. Using default (New Delhi).")

    new_report = Report(
        description=f"Tweet: {tweet_text}",
        latitude=latitude,
        longitude=longitude,
        source="Social Media",
        timestamp=datetime.datetime.now(datetime.timezone.utc),
        user_id=None,
        sentiment=sentiment
    )
    db.session.add(new_report)
    db.session.commit()
    print(f"-> Saved tweet to database.")

def fetch_and_save_tweets():
    if not BEARER_TOKEN or "YOUR_BEARER_TOKEN_HERE" in BEARER_TOKEN:
        print("\n--- ERROR: Bearer Token Missing ---")
        return

    client = tweepy.Client(BEARER_TOKEN)
    
    hazard_keywords = "(cyclone OR tsunami OR \"high tide\" OR flooding OR \"high waves\" OR \"storm surge\")"
    india_keywords = "(India OR Mumbai OR Chennai OR Kolkata OR Kerala OR Odisha OR Gujarat OR Goa OR Andhra)"
    
    query = f"{hazard_keywords} {india_keywords} lang:en -is:retweet"
    
    print(f"\nSearching X for tweets with query: {query}\n")

    try:
        response = client.search_recent_tweets(query=query, max_results=10)
        tweets = response.data
        if not tweets:
            print("No recent tweets found matching the query.")
            return

        print("--- Analyzing and Saving Live Tweets ---")
        for tweet in tweets:
            save_tweet_as_report(tweet.text)
        print("\n--- Finished saving tweets. ---")

    except tweepy.errors.TooManyRequests:
        print("\n--- ERROR: RATE LIMIT EXCEEDED. Please wait 15 minutes. ---\n")
    except Exception as e:
        print(f"An error occurred while fetching tweets: {e}")

if __name__ == "__main__":
    with app.app_context():
        fetch_and_save_tweets()

