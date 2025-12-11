import kagglehub
import os
import shutil

print("Downloading dataset...")
path = kagglehub.dataset_download("joebeachcapital/taylor-swift-all-songs-and-albums")

print("Path to dataset files:", path)

# List files
print("Files in dataset:")
files = []
for root, dirs, filenames in os.walk(path):
    for filename in filenames:
        files.append(os.path.join(root, filename))
        print(f" - {filename}")

# Copy compatible audio files
target_dir = "songs"
if not os.path.exists(target_dir):
    os.makedirs(target_dir)

count = 0
for file_path in files:
    ext = os.path.splitext(file_path)[1].lower()
    if ext in ['.mp3', '.wav', '.ogg', '.m4a']:
        shutil.copy(file_path, target_dir)
        print(f"Copied {os.path.basename(file_path)} to {target_dir}")
        count += 1

if count == 0:
    print("No audio files found in dataset.")
else:
    print(f"Successfully imported {count} songs.")
