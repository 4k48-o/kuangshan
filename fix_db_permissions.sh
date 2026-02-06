#!/bin/bash
echo "Attempting to fix MySQL permissions via Docker..."

# Try to find a mysql container
CONTAINER_ID=$(docker ps -qf "ancestor=mysql" | head -n1)

if [ -z "$CONTAINER_ID" ]; then
    # Try searching by name if image name isn't exactly 'mysql'
    CONTAINER_ID=$(docker ps -q | head -n1)
    echo "Warning: Could not find container by image name 'mysql'. Trying first active container: $CONTAINER_ID"
fi

if [ -n "$CONTAINER_ID" ]; then
    echo "Found container: $CONTAINER_ID"
    
    echo "Executing permission grant..."
    docker exec $CONTAINER_ID mysql -uroot -psj1qaz -e "CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY 'sj1qaz'; GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;"
    
    if [ $? -eq 0 ]; then
        echo "✅ Permissions updated successfully!"
        echo "You can now connect from the host."
    else
        echo "❌ Failed to update permissions. Check if the password is correct or if the container is running."
    fi
else
    echo "❌ No Docker container found."
fi
