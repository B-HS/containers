FROM nginx:1.29.4-alpine@sha256:4870c12cd2ca986de501a804b4f506ad3875a0b1874940ba0a2c7f763f1855b2

COPY nginx.conf /opt/containers/default-nginx.conf
COPY entrypoint.sh /opt/containers/entrypoint.sh
RUN mkdir -p /etc/nginx/managed
RUN chown -R 1000:1000 /etc/nginx/managed
RUN chmod 0755 /opt/containers/entrypoint.sh

VOLUME ["/etc/nginx/managed"]
ENTRYPOINT ["/opt/containers/entrypoint.sh"]
