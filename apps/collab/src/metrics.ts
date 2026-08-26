export class CollaborationMetrics {
  connectionsTotal = 0;
  activeConnections = 0;
  activeRooms = 0;
  authFailuresTotal = 0;
  permissionFailuresTotal = 0;
  disconnectsTotal = 0;
  protocolFailuresTotal = 0;
  rejectedWritesTotal = 0;

  render(): string {
    return [
      "# TYPE collab_connections_total counter", `collab_connections_total ${this.connectionsTotal}`,
      "# TYPE collab_active_connections gauge", `collab_active_connections ${this.activeConnections}`,
      "# TYPE collab_active_rooms gauge", `collab_active_rooms ${this.activeRooms}`,
      "# TYPE collab_auth_failures_total counter", `collab_auth_failures_total ${this.authFailuresTotal}`,
      "# TYPE collab_permission_failures_total counter", `collab_permission_failures_total ${this.permissionFailuresTotal}`,
      "# TYPE collab_disconnects_total counter", `collab_disconnects_total ${this.disconnectsTotal}`,
      "# TYPE collab_protocol_failures_total counter", `collab_protocol_failures_total ${this.protocolFailuresTotal}`,
      "# TYPE collab_rejected_writes_total counter", `collab_rejected_writes_total ${this.rejectedWritesTotal}`,
      "",
    ].join("\n");
  }
}
