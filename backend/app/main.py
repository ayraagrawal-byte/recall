from fastapi import FastAPI

app = FastAPI(title="Recall API")


@app.get("/")
def root():
    return {"message": "Recall API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}